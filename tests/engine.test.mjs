// tests/engine.test.mjs — T05: game engine (deterministic loop, state machine,
// events). Runs headless in Node (R-TEST-01): no `three`, no DOM.
//
// Coverage maps to task-05 acceptance criteria:
//   A3  construction: `createEngine` factory, required `game.state`, default
//       quality, `graphics.size` at construction, `gameState()` shared
//       snapshot (R-ARCH-03/05), leaderboard fallback, `state` event shape.
//   A4/A5 fixed-step clock: score-0 interval 160 ms (4×50 ms = 1 tick),
//       no tick under the boundary, frame clamped to ≤100 ms (R-PERF-02),
//       render exactly once per update.
//   A6  pond stretch: wet head widens the interval by `POND_FACTOR`
//       (R-CORE-02) — verified with both `tickIntervalMs` and observed tick
//       cadence.
//   A7  state machine: start/`pause`/resume transitions + `state` events,
//       no simulation while menu/paused/dead, restart from dead, no-ops
//       from invalid states.
//   A8  events: `eat` {c,r} exactly once with score/length `state`, no
//       `state` on non-transition ticks; wall `death` {c,r,won:false} with
//       authoritative `deathCell`, leaderboard submitted before `state`;
//       win `death` {c:null,r:null,won:true} (R-ARCH-04, `snap.won`
//       precedence).
//   A9  mute: payload + `sound.setMuted` sync, unsubscribe works.
//   A10 input state-agnostic emit with engine-side filtering (R-INPUT-01/03)
//       via a captured `install` callback, plus the real `installInput`
//       no-op in a headless (doc-less) environment.
//
// Determinism (R-TEST-02): fake clock, seeded core games — no timers, no
// three.js. Seeds come from the food-placement oracle of the reviewed core.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createGame, isWet, tickIntervalMs, POND_FACTOR } from '../js/game/core.js';
import { createEngine } from '../js/engine/engine.js';
import { seededRng } from '../js/providers/rng.js';
import { createLeaderboard } from '../js/providers/leaderboard.js';
import { installInput } from '../js/input/input.js';

// ---------------------------------------------------------------------------
// fixtures

function makeClock() {
  let t = 0;
  return { now: () => t, advance: (ms) => { t += ms; } };
}

function makeSpy() {
  const calls = [];
  const f = (...args) => calls.push(args);
  f.calls = calls;
  return f;
}

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
  };
}

/**
 * Full harness: real seeded core game + engine, event collectors, spies.
 * Seed defaults (verified against the core's food oracle):
 *   11 -> first food { c:17, r:10 }   41 -> { c:12, r:10 }   42 -> { c:17, r:13 }
 */
function makeEngine({ seed = 11, leaderboard } = {}) {
  const game = createGame({ rng: seededRng(seed) });
  const clock = makeClock();
  const sound = { play: makeSpy(), setMuted: makeSpy(), isMuted: () => false };
  const graphics = { size: makeSpy(), render: makeSpy() };
  const events = { state: [], eat: [], death: [], mute: [] };
  let inputCapture = null;
  const input = { install: (api) => { inputCapture = api; return () => {}; } };
  const lb = leaderboard !== undefined
    ? leaderboard
    : createLeaderboard({ storage: memoryStorage(), initial: [], clock });
  const engine = createEngine({ game, sound, graphics, clock, leaderboard: lb, input });
  for (const key of Object.keys(events)) {
    engine.on(key, (p) => events[key].push(p));
  }
  return {
    engine, game, events, clock, sound, graphics, lb, inputCapture,
    head: () => engine.gameState().snake[0],
  };
}

/**
 * Feed exactly `ms` of wall-clock time in 1 ms frames (R-PERF-02). The engine
 * clamps every frame to <=100 ms, so `update(160)` accumulates only 100 ms and
 * cannot cross a 160 ms boundary alone; 1 ms frames keep the accumulator in
 * exact integer ms so a score-0 (160 ms) tick fires with zero leftover.
 */
function frames(f, ms) {
  for (let i = 0; i < Math.round(ms); i += 1) f.engine.update(1);
}

/**
 * Advance the simulation until exactly `n` core ticks have run, then restore
 * the game's tick. Drives in 1 ms frames (see `frames`). Returns the number of
 * ticks that actually completed (useful when a tick enters `dead`).
 */
function driveTicks(f, n) {
  let count = 0;
  const realTick = f.game.tick;
  f.game.tick = function (...args) {
    count += 1;
    return realTick.apply(this, args);
  };
  try {
    // Each dry tick costs 160 ms, a wet tick ~356 ms; n*400 frames is a safe
    // upper bound of wall-clock time to reach `n` ticks.
    for (let i = 0; i < n * 400 && count < n; i += 1) f.engine.update(1);
  } finally {
    f.game.tick = realTick;
  }
  return count;
}

// ---------------------------------------------------------------------------
// A3 construction / factory / shared snapshot

test('A3: createEngine factory, required game, defaults, size + snapshot', () => {
  assert.throws(() => createEngine({}), /game/);
  assert.throws(() => createEngine({ game: {} }), /state/);

  const f = makeEngine();
  assert.equal(f.engine.quality, 'standard'); // default tier
  assert.deepEqual(f.graphics.size.calls[0], [960, 540]); // sized at construction
  assert.equal(f.engine.gameState().state, 'menu');
  // Shared snapshot (R-ARCH-05): same shape the core emits.
  const snap = f.engine.gameState();
  assert.equal(snap.snake.length, 3);
  assert.deepEqual(snap.snake[0], { c: 10, r: 8, pond: false });
  assert.equal(snap.alive, true);
  assert.equal(snap.won, false);

  // `state` event adds engine-owned extras (R-ARCH-04) with an empty board.
  f.engine.start();
  assert.equal(f.events.state.length, 1);
  const s = f.events.state[0];
  assert.equal(s.state, 'playing');
  assert.equal(s.score, 0);
  assert.equal(s.length, 3);
  assert.equal(s.length, s.snake.length);
  assert.ok(Array.isArray(s.top));
  assert.ok(typeof s.best === 'number');
});

test('A3: engine uses the injected leaderboard, else the game\'s own', () => {
  const game = createGame({ rng: seededRng(3) });
  const lb = createLeaderboard({ storage: memoryStorage(), initial: [], clock: makeClock() });
  game.leaderboard = lb;
  const engine = createEngine({ game });
  assert.equal(engine.leaderboard, lb);

  const game2 = createGame({ rng: seededRng(3) });
  const engine2 = createEngine({ game: game2 });
  assert.equal(engine2.leaderboard, null);
  // No leaderboard -> `top` [] / `best` 0 on `state`.
  let seen = null;
  engine2.on('state', (p) => { seen = p; });
  engine2.start();
  assert.equal(engine2.gameState().state === 'playing', true);
  assert.deepEqual(seen.top, []);
  assert.equal(seen.best, 0);
});

test('A3: `state` event carries leaderboard top/best (submitted scores)', () => {
  const f = makeEngine();
  f.lb.submit(40);
  f.lb.submit(15);
  f.engine.start();
  const s = f.events.state[0];
  assert.deepEqual(s.top.map((e) => e.score), [40, 15]);
  assert.equal(s.best, 40);
  assert.deepEqual(s.top, f.lb.list().slice(0, 3));
});

// ---------------------------------------------------------------------------
// A4 fixed-step clock (R-PERF-02)

test('A4: no tick while paused, menu, or under the boundary', () => {
  const f = makeEngine();
  // Menu: accumulator-only, the core never steps.
  f.engine.update(160);
  assert.deepEqual(f.head(), { c: 10, r: 8, pond: false });
  assert.equal(f.events.state.length, 0);

  f.engine.start();
  const before = f.head();
  f.engine.update(50);
  f.engine.update(50);
  f.engine.update(50); // 150 ms < 160 ms
  assert.deepEqual(f.head(), before);
  assert.equal(f.events.state.length, 1); // no `state` on a non-transition tick
  f.engine.update(50); // 200 ms crosses exactly one boundary
  assert.deepEqual(f.head(), { c: 10, r: 7, pond: false });
  assert.equal(f.events.state.length, 1);
});

test('A4: frame delta clamped to ≤100 ms; render once per update', () => {
  const f = makeEngine();
  f.engine.start();
  f.engine.update(500); // treated as 100 ms -> 100 < 160: no tick
  assert.deepEqual(f.head(), { c: 10, r: 8, pond: false });
  f.engine.update(500); // another effective 100 ms -> 200 ≥ 160: one tick
  assert.deepEqual(f.head(), { c: 10, r: 7, pond: false }); // not two ticks (100 < 160 per frame)
  assert.equal(f.graphics.render.calls.length, 2);
  assert.equal(f.graphics.render.calls[0][0].state, 'playing');
  assert.equal(f.graphics.render.calls[1][0].state, 'playing');

  // `graphics.size` is driven at construction ([960,540], asserted in A3) and
  // again via the exposed `resize()` (R-ARCH-02).
  f.engine.resize(320, 240);
  assert.deepEqual(f.graphics.size.calls.at(-1), [320, 240]);
});

test('A4: speed-up formula — base = max(60, 160 - floor(score/10)) ms', () => {
  // R-CORE-01: base interval, no pond.
  assert.equal(tickIntervalMs({ score: 0, snake: [{ c: 0, r: 0, pond: false }] }), 160);
  assert.equal(tickIntervalMs({ score: 100, snake: [{ c: 0, r: 0, pond: false }] }), 150);
  assert.equal(tickIntervalMs({ score: 500, snake: [{ c: 0, r: 0, pond: false }] }), 110);
  assert.equal(tickIntervalMs({ score: 1000, snake: [{ c: 0, r: 0, pond: false }] }), 60); // floor
});

// ---------------------------------------------------------------------------
// A5 + A6 pond stretch (R-CORE-02, R-PERF-02)

test('A6: wet head stretches the interval by POND_FACTOR', () => {
  assert.ok(isWet(13, 12)); // pond sanity: (13-14)^2+(12-14)^2 = 5 ≤ 9
  assert.ok(!isWet(13, 11));

  const f = makeEngine({ seed: 41 }); // food {12,10} is off the walk path
  f.engine.start();
  f.engine.turn({ c: 1, r: 0 }); // east: (11,8) (12,8) (13,8)
  driveTicks(f, 3);
  f.engine.turn({ c: 0, r: 1 }); // south: (13,9) (13,10) (13,11) (13,12 wet)
  driveTicks(f, 4);
  assert.deepEqual(f.head(), { c: 13, r: 12, pond: true }); // (1)² + (2)² = 5 ≤ 9

  const wetInterval = tickIntervalMs(f.engine.gameState());
  assert.equal(wetInterval, 160 / POND_FACTOR); // 355.56… ms (R-CORE-02)

  // Reset the accumulator to zero for an exact cadence proof: a pause +
  // resume does not step the sim but clears the leftover (R-PERF-03).
  f.engine.pause();
  f.engine.resume();
  assert.deepEqual(f.head(), { c: 13, r: 12, pond: true });

  // A dry 160 ms interval would tick well before 356 ms; the wet head
  // stretches it to ~355.56 ms, so 355 ms of wall time leaves the head still.
  frames(f, 355);
  assert.deepEqual(f.head(), { c: 13, r: 12, pond: true });
  // One more frame crosses the stretched boundary: exactly one tick (-> (13,13),
  // still wet). A dry rate would already have produced two ticks by 356 ms.
  frames(f, 1);
  assert.deepEqual(f.head(), { c: 13, r: 13, pond: true });
});

// ---------------------------------------------------------------------------
// A7 state machine

test('A7: pause/resume — no simulation while paused, resume blip fires', () => {
  const f = makeEngine();
  f.engine.start();
  driveTicks(f, 1); // one tick (north) -> (10,7), dry
  f.engine.pause();
  assert.equal(f.events.state.at(-1).state, 'paused');
  const h = f.head();
  f.engine.update(100); // paused: accumulator may build but never ticks
  f.engine.update(100);
  assert.deepEqual(f.head(), h);
  assert.equal(f.events.state.length, 2); // start + pause only

  f.engine.resume();
  assert.equal(f.events.state.at(-1).state, 'playing');
  assert.ok(f.sound.play.calls.some((a) => a[0] === 'resume'));
  // Resume resets the accumulator (R-PERF-03): a fresh 160 ms ticks once.
  driveTicks(f, 1); // -> (10,6), dry
  assert.deepEqual(f.head(), { c: 10, r: 6, pond: false });
});

test('A7: no-ops from invalid states', () => {
  const f = makeEngine();
  f.engine.pause(); // menu: no-op
  assert.equal(f.engine.gameState().state === 'menu', true);
  assert.equal(f.events.state.length, 0);
  f.engine.resume(); // not paused: no-op
  f.engine.start(); // now playing
  assert.equal(f.events.state.length, 1);
  f.engine.start(); // playing: no-op
  assert.equal(f.events.state.length, 1);
  // Dead: start/pause no-ops, resume no-op (covered next test too).
});

test('A7: restart from dead — fresh layout, score 0, wet flags recomputed', () => {
  const f = makeEngine({ seed: 11 }); // wall-death fixture (food off row 8)
  f.engine.start();
  f.engine.turn({ c: 1, r: 0 }); // east: (11,8)…(19,8); the 10th tick exits at (20,8)
  driveTicks(f, 10); // the 10th tick enters dead
  assert.equal(f.engine.gameState().state === 'dead', true);
  assert.equal(f.events.death.length, 1);

  f.engine.start(); // dead -> playing, fresh layout
  const s = f.events.state.at(-1);
  assert.equal(s.state, 'playing');
  assert.equal(s.score, 0);
  assert.equal(s.length, 3);
  assert.deepEqual(s.snake[0], { c: 10, r: 8, pond: false });
  assert.deepEqual(s.direction, { c: 0, r: -1 }); // heading reset
  assert.ok(s.food); // fresh food placed
  assert.equal(s.food.c, f.engine.gameState().food.c);
  // Restart resets the accumulator: a single fresh 160 ms tick steps once.
  driveTicks(f, 1);
  assert.deepEqual(f.head(), { c: 10, r: 7, pond: false });
});

// ---------------------------------------------------------------------------
// A8 eat / death / win events (R-ARCH-04)

test('A8: eat — one `eat` {c,r}, one `state` (score 10 / length 4), eat blip', () => {
  const f = makeEngine({ seed: 11 }); // first food { c:17, r:10 }
  f.engine.start();
  // Drive with `driveTicks` (1 ms frames), NOT raw `update(160)`: the engine
  // clamps every frame delta to <=100 ms (R-PERF-02), so a 160 ms frame alone
  // can never cross a 160 ms (score-0) tick boundary.
  f.engine.turn({ c: 1, r: 0 }); // east: (11,8)..(17,8) = 7 ticks @ 160 ms
  driveTicks(f, 7);
  assert.deepEqual(f.head(), { c: 17, r: 8, pond: false });
  assert.equal(f.events.eat.length, 0);
  f.engine.turn({ c: 0, r: 1 }); // south
  driveTicks(f, 1); // (17,9) — no eat yet
  assert.deepEqual(f.head(), { c: 17, r: 9, pond: false });
  assert.equal(f.events.eat.length, 0);
  assert.equal(f.events.state.length, 1); // only start — non-eat ticks emit no `state`
  driveTicks(f, 1); // (17,10) — food
  assert.deepEqual(f.head(), { c: 17, r: 10, pond: false });
  assert.equal(f.events.eat.length, 1);
  assert.deepEqual(f.events.eat[0], { c: 17, r: 10 });
  const s = f.events.state.at(-1);
  assert.equal(s.score, 10);
  assert.equal(s.length, 4);
  assert.equal(s.alive, true);
  assert.equal(s.state, 'playing');
  assert.ok(s.food); // respawned food
  assert.equal(f.events.state.length, 2); // start + the single eat (no double-emit on same tick)
  assert.equal(f.sound.play.calls.filter((a) => a[0] === 'eat').length, 1);
});

test('A8: wall death — `death` {c,r,won:false}, submit before `state`, no further sim', () => {
  const f = makeEngine({ seed: 11 });
  f.engine.start();
  f.engine.turn({ c: 1, r: 0 }); // east: (11,8)…(19,8); the 10th tick exits at (20,8)
  driveTicks(f, 10);
  assert.equal(f.events.death.length, 1);
  assert.deepEqual(f.events.death[0], { c: 20, r: 8, won: false });
  assert.deepEqual(f.engine.gameState().deathCell, { c: 20, r: 8 });
  assert.equal(f.engine.gameState().alive, false);

  // The run was submitted BEFORE the `state` event: `top`/`best` already
  // include this run's (0) score.
  assert.equal(f.lb.list().length, 1);
  assert.equal(f.lb.list()[0].score, 0);
  const s = f.events.state.at(-1);
  assert.equal(s.state, 'dead');
  assert.equal(s.alive, false);
  assert.equal(s.won, false);
  assert.deepEqual(s.top, f.lb.list().slice(0, 3));
  assert.equal(s.best, 0);

  // Dead: the simulation never steps again.
  const before = f.events;
  f.engine.update(160);
  f.engine.update(160);
  assert.equal(f.events.death.length, before.death.length); // 1
  assert.equal(f.events.state.length, 2); // start + death
  assert.deepEqual(f.head(), { c: 19, r: 8, pond: false });
});

test('A8: win — `snap.won` beats `snap.alive`: `death` {c:null,r:null,won:true}', () => {
  const f = makeEngine({ seed: 42 });
  f.engine.start();
  // The core's win boundary (full 400-cell board) is unreachable in a short
  // deterministic run, so the core's single win tick is scripted to set the
  // exact win fields core's spawnFood win path sets: food=null, won=true,
  // alive=false, phase='dead', deathCell=null. The engine's update loop then
  // reads this snapshot (its `snap`, the returned state()) and reacts:
  // `snap.won` beats `snap.alive` → death { c:null, r:null, won:true }.
  f.game.tick = function () {
    this.food = null;
    this.won = true;
    this.alive = false;
    this.phase = 'dead';
    this.deathCell = null;
    return this.state();
  };
  driveTicks(f, 1); // the single scripted win tick
  assert.equal(f.events.death.length, 1);
  assert.deepEqual(f.events.death[0], { c: null, r: null, won: true });
  const s = f.events.state.at(-1);
  assert.equal(s.state, 'dead');
  assert.equal(s.won, true);
  assert.equal(s.deathCell, null);
  assert.equal(s.alive, false);
  // Win run also submitted (before the `state` event).
  assert.equal(f.lb.list().length, 1);
  assert.equal(f.events.state.length, 2); // start + win-state
  // No further sim on the dead board.
  f.engine.update(160);
  assert.equal(f.events.death.length, 1);
});

// ---------------------------------------------------------------------------
// A9 mute (R-UI-01): payload mirrors `sound.isMuted()`; `setMuted` syncs the
// same booleans; the backend suppresses `play` output while muted.

test('A9: mute() x2 syncs setMuted + mute payload; play suppressed while muted', () => {
  // A stateful backend so `isMuted()` reflects the last `setMuted` and
  // `play()` swallows output while muted (R-UI-01). From an unmuted start the
  // first `mute()` turns sound ON (toggles muted=true).
  let muted = false;
  const plays = [];
  const setCalls = [];
  const sound = {
    play: (n) => { if (!muted) plays.push(n); },
    setMuted: (b) => { muted = b; setCalls.push(b); },
    isMuted: () => muted,
  };
  const game = createGame({ rng: seededRng(11) });
  const engine = createEngine({
    game,
    sound,
    graphics: { size() {}, render() {} },
    clock: makeClock(),
    leaderboard: createLeaderboard({ storage: memoryStorage(), initial: [], clock: makeClock() }),
  });
  const mutes = [];
  engine.on('mute', (p) => mutes.push(p));

  engine.start();
  engine.mute(); // unmuted -> muted
  engine.mute(); // muted -> unmuted

  // Two `mute` events whose payloads mirror the backend's live muted state
  // (R-ARCH-04: `mute` -> { muted: sound.isMuted() }).
  assert.equal(mutes.length, 2);
  assert.deepEqual(mutes.map((m) => m.muted), [true, false]);
  // `setMuted` received the same booleans, in order.
  assert.deepEqual(setCalls, [true, false]);
  assert.deepEqual(mutes.map((m) => m.muted), setCalls);

  // `play('resume')` is suppressed while muted: mute, then resume -> the
  // engine still calls the backend, but the backend records zero while muted.
  engine.mute(); // muted = true again
  engine.pause();
  const playsBefore = plays.length;
  engine.resume(); // backend play('resume') is swallowed (muted)
  assert.equal(plays.length, playsBefore); // zero new `play` calls

  // With sound restored the resume blip is recorded.
  engine.mute(); // muted = false
  engine.pause();
  engine.resume();
  assert.equal(plays.at(-1), 'resume');
});

// ---------------------------------------------------------------------------
// A10 input (R-INPUT-01/03): input is a state-agnostic event source; the
// engine applies per-state filtering. Plus the real `installInput` degrading to
// a no-op in a headless (doc-less) Node environment.

test('A10: engine-side input filtering — start/pause/mute per state, turn forwards', () => {
  const f = makeEngine(); // harness input capture gives the engine's `emit`
  const emit = (ev) => f.inputCapture.emit(ev);

  // menu: `pause` is a no-op (only playing/paused toggles).
  assert.equal(f.engine.gameState().state, 'menu');
  emit({ type: 'pause' });
  assert.equal(f.engine.gameState().state, 'menu');

  // menu -> `start` begins the run (fresh board).
  emit({ type: 'start' });
  assert.equal(f.engine.gameState().state, 'playing');
  assert.equal(f.engine.gameState().score, 0);

  // playing: a second `start` is a no-op (only menu/dead restarts).
  emit({ type: 'start' });
  assert.equal(f.engine.gameState().state, 'playing');
  assert.equal(f.events.state.length, 1); // only the initial start `state`

  // `turn` is always forwarded (state-agnostic); the buffered turn is applied
  // by the next playing tick.
  emit({ type: 'turn', dir: { c: 1, r: 0 } }); // east
  driveTicks(f, 1);
  assert.deepEqual(f.head(), { c: 11, r: 8, pond: false }); // east, not north

  // `pause` toggle only acts while playing/paused.
  emit({ type: 'pause' });
  assert.equal(f.engine.gameState().state, 'paused');
  emit({ type: 'pause' }); // resume
  assert.equal(f.engine.gameState().state, 'playing');

  // `mute` is forwarded regardless of state.
  emit({ type: 'mute' });
  assert.equal(f.events.mute.length, 1);
});

test('A10: real installInput no-ops headlessly (no document in Node)', () => {
  const game = createGame({ rng: seededRng(11) });
  // The engine installs the real `installInput`; in Node `document` is
  // undefined (-> null), so its addEventListener loop throws and the engine's
  // try/catch swallows it: construction never throws, input is a no-op.
  assert.doesNotThrow(() => {
    const engine = createEngine({
      game,
      input: { install: installInput },
      graphics: { size() {}, render() {} },
      clock: makeClock(),
      leaderboard: createLeaderboard({ storage: memoryStorage(), initial: [], clock: makeClock() }),
    });
    assert.equal(engine._inputOff, null);
    // The engine is otherwise fully usable headless.
    engine.start();
    assert.equal(engine.gameState().state, 'playing');
  });
});
