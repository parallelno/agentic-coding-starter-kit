// T13 — headless end-to-end integration (Node, no WebGL).
// Drives the real game + engine with mock graphics/clock/sound and asserts a
// full play: start -> ticks -> eat (score 10, length 4) -> death -> restart ->
// pause/resume -> mute. Mirrors the wiring seam patterns (fakeClock, etc.).

import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../js/game/core.js';
import { createEngine } from '../js/engine/engine.js';
import { seededRng } from '../js/providers/rng.js';
import { createLeaderboard } from '../js/providers/leaderboard.js';
import { createSoundBackend } from '../js/ui/audio.js';

// --- seams ------------------------------------------------------------------
function fakeClock() {
  return {
    t: 0,
    now() {
      return this.t;
    },
    add(ms) {
      this.t += ms;
    },
  };
}

function mockGraphics() {
  return {
    sizes: [],
    renders: [],
    size(w, h) {
      this.sizes.push([w, h]);
    },
    render(s) {
      this.renders.push(s);
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

// A spy WebAudio context so `play` has a real (recorded) surface to hit.
function spyCtx() {
  const oscs = [];
  return {
    oscs,
    currentTime: 0,
    destination: {},
    createOscillator() {
      const o = {
        type: '',
        onended: null,
        frequency: { setValueAtTime() {}, linearRampToValueAtTime() {} },
        connect() {},
        start() {},
        stop() {},
        disconnect() {},
      };
      oscs.push(o);
      return o;
    },
    createGain() {
      return {
        gain: { setValueAtTime() {}, linearRampToValueAtTime() {} },
        connect() {},
        disconnect() {},
      };
    },
  };
}

function makeEngine(rngSeed) {
  const game = createGame({ rng: seededRng(rngSeed) });
  const clock = fakeClock();
  const graphics = mockGraphics();
  const sound = createSoundBackend({ audioCtx: spyCtx() });
  // Record every play() so we can assert mute suppression at the backend level.
  const plays = [];
  const origPlay = sound.play.bind(sound);
  sound.play = (name) => {
    plays.push({ name, muted: sound.isMuted() });
    return origPlay(name);
  };
  const engine = createEngine({
    game,
    sound,
    graphics,
    clock,
    quality: 'standard',
    leaderboard: createLeaderboard({ storage: memStorage(), now: () => 5 }),
  });
  const events = { eat: [], death: [], state: [], mute: [] };
  engine.on('eat', (e) => events.eat.push(e));
  engine.on('death', (e) => events.death.push(e));
  engine.on('state', (e) => events.state.push(e));
  engine.on('mute', (e) => events.mute.push(e));
  return { game, clock, graphics, sound, plays, engine, events };
}

// Advance exactly `n` fixed-step ticks. update() clamps dtMs to 100 ms, so the
// accumulator drift makes "one update == one tick" unreliable; instead we prime
// _acc to the current tick interval and call update(0) (dt contributes 0, so the
// accumulator holds exactly one interval -> the while-loop consumes exactly one
// tick). White-box but deterministic, and still exercises the real update().
function ticks(engine, n) {
  for (let i = 0; i < n; i++) {
    const interval = engine.game.tickIntervalMs(engine.game.state());
    engine._acc = interval;
    engine.update(0);
  }
}

// Pump real (clamped) time until the snake is no longer playing (wall/self death).
function pumpToDeath(engine, clock) {
  let guard = 0;
  while (engine.snapshot().state === 'playing' && guard++ < 200) {
    clock.add(160);
    engine.update(160);
  }
}

test('full playthrough: start, ticks, eat, death, restart', (t) => {
  const { game, clock, engine, events, graphics } = makeEngine(42);

  assert.equal(engine.game.state().state, 'menu');

  // -- start --
  engine.start();
  assert.equal(game.state().state, 'playing');

  // -- a few ticks with no interaction: snake advances north --
  const h0 = game.state().snake[0];
  const beforeScore = game.state().score;
  ticks(engine, 5);
  const h5 = game.state().snake[0];
  assert.ok(graphics.renders.length >= 1, 'render is called each update');
  // 5 north ticks from r=8 -> r=3 (no pond on column 10, base interval 160).
  assert.equal(h5.c, 10);
  assert.equal(h5.r, h0.r - 5);
  assert.equal(game.state().score, beforeScore, 'score unchanged without eating');
  assert.equal(game.state().snake.length, 3, 'length unchanged without eating');

  // -- force a deterministic eat: place food one cell ahead of the head --
  const head = game.state().snake[0];
  const dir = game.state().direction;
  game._s.food = { c: head.c + dir.c, r: head.r + dir.r };
  ticks(engine, 1);

  const eatenHead = game.state().snake[0];
  assert.equal(game.state().score, 10, 'eating gives score 10');
  assert.equal(game.state().snake.length, 4, 'eating grows length to 4');
  assert.equal(events.eat.length, 1, 'exactly one eat event');
  assert.deepEqual(
    [events.eat[0].c, events.eat[0].r],
    [eatenHead.c, eatenHead.r],
    'eat event points at the new head cell'
  );
  assert.equal(game.state().state, 'playing');

  // -- steer into a wall and pump until dead --
  events.death.length = 0;
  const deathStarter = engine.snapshot();
  assert.equal(deathStarter.state, 'playing');
  // Head is at r=2 after the eat tick; pump toward the top wall.
  pumpToDeath(engine, clock);
  assert.equal(engine.snapshot().state, 'dead', 'snake dies at the wall');
  assert.equal(events.death.length, 1, 'exactly one death event');
  assert.equal(events.death[0].won, false, 'wall death is not a win');
  const dc = engine.snapshot().deathCell;
  assert.ok(dc, 'deathCell is set');
  assert.equal(events.death[0].c, dc.c);
  assert.equal(events.death[0].r, dc.r);
});

test('restart produces a fresh snapshot (score 0, length 3)', (t) => {
  const { game, clock, engine } = makeEngine(7);
  engine.start();
  // Eat one to prove score is non-zero before restart.
  const head = game.state().snake[0];
  const dir = game.state().direction;
  game._s.food = { c: head.c + dir.c, r: head.r + dir.r };
  ticks(engine, 1);
  assert.ok(game.state().score > 0);

  // Die so that start() is legal again (menu/dead only).
  pumpToDeath(engine, clock);
  assert.equal(engine.snapshot().state, 'dead');

  engine.start();
  assert.equal(game.state().state, 'playing');
  assert.equal(game.state().score, 0, 'score reset to 0');
  assert.equal(game.state().snake.length, 3, 'length reset to 3');
  assert.equal(game.state().deathCell, null, 'deathCell cleared');
  assert.ok(game.state().food, 'fresh food spawned');
});

test('pause halts ticks; resume continues; resume plays sfx', (t) => {
  const { game, clock, engine, events, plays } = makeEngine(11);
  engine.start();

  const headBefore = game.state().snake[0];
  engine.pause();
  assert.equal(game.state().state, 'paused');

  // 10 clamped-time updates elapse -> no movement while paused.
  for (let i = 0; i < 10; i++) {
    clock.add(160);
    engine.update(160);
  }
  assert.equal(game.state().state, 'paused');
  assert.deepEqual(
    [game.state().snake[0].c, game.state().snake[0].r],
    [headBefore.c, headBefore.r],
    'no ticks while paused'
  );

  // resume() emits its own state event and plays the resume sfx.
  const stateBefore = events.state.length;
  plays.length = 0;
  engine.resume();
  assert.equal(game.state().state, 'playing');
  assert.equal(events.state.length, stateBefore + 1, 'resume emits a state event');
  assert.ok(
    plays.some((p) => p.name === 'resume' && !p.muted),
    'resume sfx played and not muted'
  );

  // Movement resumes.
  const hb = game.state().snake[0];
  ticks(engine, 3);
  assert.equal(game.state().snake[0].r, hb.r - 3, 'snake moves again after resume');
});

test('mute toggles backend muted state and suppresses play', (t) => {
  const { engine, sound, plays } = makeEngine(23);
  engine.start();

  // Unmuted by default.
  assert.equal(sound.isMuted(), false);

  // Mute -> backend flagged, event carries muted:true.
  const muteEvents = [];
  let lastMuteState = null;
  const unsub = engine.on('mute', (e) => muteEvents.push(e));
  engine.mute();
  unsub();
  assert.equal(sound.isMuted(), true, 'backend is muted after mute()');
  assert.equal(muteEvents.length, 1);
  assert.equal(muteEvents[0].muted, true, 'mute event reports muted:true');
  // stateEvt snapshot also reflects... (no mute field on snapshot; skip)

  // A resume-while-muted is still recorded but flagged muted (no audio).
  engine.pause();
  plays.length = 0;
  engine.resume();
  const resume = plays.find((p) => p.name === 'resume');
  assert.ok(resume, 'resume play() still routed while muted');
  assert.equal(resume.muted, true, 'resume is muted');

  // Unmute -> back to false.
  engine.mute();
  assert.equal(sound.isMuted(), false, 'unmute restores playback');
});
