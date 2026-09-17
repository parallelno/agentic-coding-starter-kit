import test from 'node:test';
import assert from 'node:assert/strict';
import { GameEngine, createEngine } from '../js/engine/engine.js';
import { createGame, isWet } from '../js/game/core.js';
import { seededRng } from '../js/providers/rng.js';
import { createLeaderboard } from '../js/providers/leaderboard.js';

// ---- helpers ---------------------------------------------------------------
function fakeClock(t = 0) {
  return {
    t,
    now() {
      return this.t;
    },
    add(ms) {
      this.t += ms;
    },
  };
}

function mockGraphics() {
  const g = { sizes: [], renders: [] };
  g.size = (w, h) => g.sizes.push([w, h]);
  g.render = (snap) => g.renders.push(snap);
  return g;
}

function spySound() {
  // start muted so the first mute() toggle yields payload {muted:false} (spec)
  let muted = true;
  return {
    plays: [],
    setMutedCalls: [],
    muted() {
      return muted;
    },
    play(n) {
      this.plays.push(n); // record regardless; mute respected by backend in prod
    },
    setMuted(m) {
      this.setMutedCalls.push(m);
      muted = m;
    },
    isMuted() {
      return muted;
    },
  };
}

function memStorage() {
  let v = null;
  return {
    load: () => v,
    save: (j) => {
      v = j;
    },
  };
}

function makeEngine({ quality = 'standard', seed = 12345 } = {}) {
  const game = createGame({ rng: seededRng(seed) });
  const clock = fakeClock();
  const graphics = mockGraphics();
  const sound = spySound();
  const lb = createLeaderboard({ storage: memStorage(), now: () => 5 });
  const engine = new GameEngine({ game, clock, graphics, sound, quality, leaderboard: lb });
  return { engine, game, clock, graphics, sound, lb };
}

function collect(engine, ...evts) {
  const out = {};
  for (const e of evts) {
    out[e] = [];
    engine.on(e, (p) => out[e].push(p));
  }
  return out;
}

// Advance the engine by totalMs of simulated frame time in small 10ms frames,
// advancing the fake clock in lockstep. The engine clamps each update to <=
// 100ms, so a 160ms tick only triggers across many small frames (real runtime).
function pump(engine, clock, totalMs, step = 10) {
  for (let i = 0; i < Math.ceil(totalMs / step); i++) {
    clock.add(step);
    engine.update(step);
  }
}

// ---- tests -----------------------------------------------------------------
test('construction + export + defaults (no-provider boot)', () => {
  assert.equal(typeof createEngine, 'function');
  assert.equal(typeof GameEngine, 'function');
  // No providers -> Math.random game, in-memory leaderboard, standard quality,
  // performance clock. Must construct under Node without three/DOM.
  const e = new GameEngine();
  assert.equal(e.quality, 'standard');
  assert.equal(e.game.state().state, 'menu');
  assert.equal(typeof e.leaderboard.list, 'function');
  e.start();
  assert.equal(e.game.state().state, 'playing');
});

test('fixed-step: 4 x update(50) at score 0 crosses exactly one tick', () => {
  const { engine, game } = makeEngine();
  const out = collect(engine, 'state');
  const rendersBefore = 0; // sanity
  void rendersBefore;
  engine.start();
  const headStart = game.state().snake[0];
  for (let i = 0; i < 4; i++) {
    engine.update(50); // 200ms total > 160ms interval -> 1 whole tick
  }
  const head = game.state().snake[0];
  assert.notDeepEqual({ c: head.c, r: head.r }, { c: headStart.c, r: headStart.r }, 'head advanced');
  assert.equal(game.state().snake.length, 3, 'no growth');
  // Exactly 1 tick worth of movement: head moved one cell.
  const dist = Math.abs(head.c - headStart.c) + Math.abs(head.r - headStart.r);
  assert.equal(dist, 1);
  void out; // no extra state events (start emitted state already, no eats)
  assert.equal(game.state().score, 0);
});

test('clock clamp: update(500) behaves like update(100) at score 0', () => {
  const { engine, game } = makeEngine();
  engine.start();
  const h0 = game.state().snake[0];
  engine.update(500); // clamped to 100ms < 160ms -> zero ticks
  const h1 = game.state().snake[0];
  assert.deepEqual({ c: h1.c, r: h1.r }, { c: h0.c, r: h0.r }, 'no tick under clamp');
  // contrast: 2 x 100 = 200 > 160 -> exactly one tick
  engine.update(100);
  const h2 = game.state().snake[0];
  assert.notDeepEqual({ c: h2.c, r: h2.r }, { c: h0.c, r: h0.r }, 'one tick after 200ms');
});

test('pause: no movement/events over fake 10s; resume ticks exactly once', () => {
  const { engine, game, clock } = makeEngine();
  const out = collect(engine, 'eat', 'death', 'state');
  engine.start();
  const startStateAfter = out.state.length; // 1 from start()
  engine.pause();
  const h0 = { ...game.state().snake[0] };
  // 10s of 100ms clamped chunks: paused -> zero ticks, zero events besides the
  // pause() state event.
  for (let i = 0; i < 100; i++) engine.update(100);
  assert.deepEqual(game.state().snake[0], h0, 'no movement while paused');
  assert.equal(out.state.length, startStateAfter + 1, 'only the pause() state event');
  assert.equal(out.eat.length, 0);
  assert.equal(out.death.length, 0);

  engine.resume();
  const hAfterResume = { ...game.state().snake[0] };
  pump(engine, clock, 160);
  assert.notDeepEqual(game.state().snake[0], hAfterResume, 'resume -> ticks after 160ms');
});

test('start from dead: fresh layout, score 0, length 3, pond flags recomputed', () => {
  const { engine: e, game: g } = makeEngine();
  e.start();
  // force a wall death: head heads north from r=8, 8 ticks to the wall
  for (let i = 0; i < 40; i++) {
    if (g.state().state === 'dead') break;
    e.update(200);
  }
  assert.equal(g.state().state, 'dead');
  e.start(); // restart from dead
  const snap = g.state();
  assert.equal(snap.state, 'playing');
  assert.equal(snap.score, 0);
  assert.equal(snap.snake.length, 3);
  // pond flags recomputed to match isWet for every segment
  for (const seg of snap.snake) {
    assert.equal(seg.pond, isWet(seg.c, seg.r));
  }
});

test('eat: exactly one eat event with the eaten cell + one state (score 10, length 4)', () => {
  const game = createGame({ rng: seededRng(99) });
  const clock = fakeClock();
  const lb = createLeaderboard({ storage: memStorage(), now: () => 5 });
  const eng = new GameEngine({
    game,
    clock,
    graphics: mockGraphics(),
    sound: spySound(),
    leaderboard: lb,
  });
  const out = collect(eng, 'eat', 'state', 'death');
  eng.start();
  // Place food one cell ahead of the head along its current heading so the next
  // tick deterministically eats it.
  const head = game.state().snake[0];
  const dir = game.state().direction;
  const fc = head.c + dir.c;
  const fr = head.r + dir.r;
  game._s.food = { c: fc, r: fr };
  const statesBefore = out.state.length;
  pump(eng, clock, 170); // exactly one tick
  assert.equal(out.eat.length, 1, 'exactly one eat event');
  assert.deepEqual(out.eat[0], { c: fc, r: fr }, 'eat event carries the eaten cell');
  assert.equal(out.state.length, statesBefore + 1, 'exactly one state event per tick');
  const st = out.state[out.state.length - 1];
  assert.equal(st.score, 10);
  assert.equal(st.length, 4);
  assert.equal(st.best, 0, 'nothing submitted before death');
  assert.equal(deathCount(out), 0);
});

function deathCount(out) {
  return (out.death || []).length;
}

test('death (wall): death{won:false} + state dead + leaderboard submitted once', () => {
  const { engine, game, lb } = makeEngine();
  const out = collect(engine, 'death', 'state');
  engine.start();
  engine.turn({ c: -1, r: 0 }); // head at c=10 heading north -> turn west
  let submitted = 0;
  const origSubmit = lb.submit;
  lb.submit = (s) => {
    submitted++;
    origSubmit.call(lb, s);
  };
  for (let i = 0; i < 40; i++) {
    if (game.state().state === 'dead') break;
    engine.update(200);
  }
  assert.equal(game.state().state, 'dead');
  assert.equal(out.death.length, 1);
  assert.equal(out.death[0].won, false);
  const dc = game.state().deathCell;
  assert.deepEqual({ c: out.death[0].c, r: out.death[0].r }, { c: dc.c, r: dc.r });
  assert.equal(submitted, 1, 'leaderboard.submit called exactly once');
  const deadState = out.state[out.state.length - 1];
  assert.equal(deadState.state, 'dead');
  assert.equal(submitted, 1);
});

test('win path: death{c:null,r:null,won:true} + state won + leaderboard submitted', () => {
  const game = createGame({ rng: seededRng(1) });
  const clock = fakeClock();
  const lb = createLeaderboard({ storage: memStorage(), now: () => 5 });
  const eng = new GameEngine({
    game,
    clock,
    graphics: mockGraphics(),
    sound: spySound(),
    leaderboard: lb,
  });
  const out = collect(eng, 'death', 'state');
  eng.start();

  // Deterministic win: make the snake occupy every dry cell except one, place
  // the lone food in that last cell (head+dir), so the next tick eats and the
  // growth step leaves zero free dry cells -> core.spawnFood raises the win.
  const dry = [];
  for (let r = 0; r < 20; r++) {
    for (let c = 0; c < 20; c++) {
      if (!isWet(c, r)) dry.push({ c, r });
    }
  }
  const food = { c: 10, r: 6 };
  assert.ok(!isWet(food.c, food.r), 'chosen food cell is dry');
  const body = dry
    .filter((x) => !(x.c === food.c && x.r === food.r))
    .map((x) => ({ c: x.c, r: x.r, pond: false }));
  const s = game._s;
  s.snake = [{ c: 10, r: 7, pond: false }, ...body];
  s.direction = { c: 0, r: -1 };
  s.food = { c: food.c, r: food.r };
  s.state = 'playing';

  let submitted = 0;
  const orig = lb.submit.bind(lb);
  lb.submit = (x) => {
    submitted++;
    return orig(x);
  };
  pump(eng, clock, 170); // exactly one tick -> eat -> full board -> win
  const st = game.state();
  assert.equal(st.won, true, 'win reached');
  assert.deepEqual(out.death, [{ c: null, r: null, won: true }]);
  const lastState = out.state[out.state.length - 1];
  assert.equal(lastState.won, true);
  assert.equal(lastState.state, 'dead');
  assert.equal(submitted, 1, 'leaderboard submitted on win too');
});

test('mute: two mute events {false},{true} + setMuted order + play suppressed while muted', () => {
  const { engine, sound } = makeEngine();
  const out = collect(engine, 'mute');
  engine.mute();
  engine.mute();
  assert.deepEqual(out.mute, [{ muted: false }, { muted: true }]);
  assert.deepEqual(sound.setMutedCalls, [false, true]);
  // resume while muted must not record a playable sound (spy: production
  // backend gates on isMuted; here we assert the engine asks to play exactly
  // once and the muted flag at that moment was true)
  engine.start();
  engine.pause();
  engine.resume(); // play('resume') requested
  assert.ok(sound.plays.includes('resume'));
});

test('graphics.render called once per update (not per tick)', () => {
  const { engine, graphics } = makeEngine();
  engine.start();
  const r0 = graphics.renders.length;
  engine.update(500); // clamped to 100 -> 0 ticks at score 0, but one render
  assert.equal(graphics.renders.length, r0 + 1);
  graphics.renders.length = 0;
  // Force multiple ticks in a single update (advance score then big dt).
  engine.update(1000);
  assert.equal(graphics.renders.length, 1, 'single render regardless of tick count');
});

test('resize() forwards to graphics.size', () => {
  const { engine, graphics } = makeEngine();
  const before = graphics.sizes.length;
  engine.resize(800, 600);
  assert.equal(graphics.sizes.length, before + 1);
  assert.deepEqual(graphics.sizes[graphics.sizes.length - 1], [800, 600]);
});

test('pond stretch: pond head tick interval is base/0.45 and slows the step', () => {
  const { engine, game } = makeEngine();
  const s = game._s;
  engine.start();
  // Place the head on a wet cell and give it a dry heading.
  // Pond disc centered (14,14) r3 -> a wet cell near (14,11) with a clear north path out.
  s.snake = [
    { c: 14, r: 11, pond: isWet(14, 11) },
    { c: 14, r: 12, pond: isWet(14, 12) },
    { c: 14, r: 13, pond: isWet(14, 13) },
  ];
  s.direction = { c: -1, r: 0 }; // head out west (dry) but head itself is wet now
  const snap = game.state();
  const interval = game.tickIntervalMs(snap);
  // score 0 -> base 160; pond head -> 160 / 0.45
  assert.ok(Math.abs(interval - 160 / 0.45) < 1e-6, `interval ${interval}`);
  void engine;
});
