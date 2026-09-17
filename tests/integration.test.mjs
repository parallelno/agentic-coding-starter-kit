// tests/integration.test.mjs — T13 headless end-to-end integration gate.
//
// Runs in Node with no WebGL / no DOM (R-TEST-01): it exercises the *real*
// core game + real engine wired together with mock graphics / sound / clock /
// input, per R-ARCH-02. This is the wave-6 (final) Node gate; the R-TEST-03
// browser/visual checklist is validated separately against a live page.
//
// Named tests map 1:1 to the headless integration contract in task-13:
//   1. start -> play -> eat            (seeded run reaches the food)
//   2. steer into wall -> death        (no input; runs off the north wall)
//   3. start() again -> fresh snapshot (score resets to 0)
//   4. pause -> no tick events         (a full 10*TICK_MS of updates)
//   5. resume -> ticks resume
//   6. mute -> setMuted(true) + play suppressed while muted
//
// Determinism (R-TEST-02): fake clock + seeded core game only; no timers and
// no three.js. Seed 26 is verified against the core's food oracle: after
// `start()` the first food lands at { c:10, r:0 }, directly north of the
// head { c:10, r:8 }. With no input steering the snake drifts straight north,
// so it crosses the food cell (eat at head { c:10, r:0 }) and one tick later
// leaves the grid through the top wall (deathCell { c:10, r:-1 }).
//
// The tick-driving fixtures (makeClock / makeSpy / memoryStorage / driveTicks /
// driveToDead) mirror the reviewed T05 engine harness and T12 wiring harness
// exactly, including the 1 ms-frame trick that dodges the engine's 100 ms
// per-frame clamp so a score-0 (160 ms) tick fires with zero leftover.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createGame, TICK_MS } from '../js/game/core.js';
import { createEngine } from '../js/engine/engine.js';
import { seededRng } from '../js/providers/rng.js';
import { createLeaderboard } from '../js/providers/leaderboard.js';

// ---------------------------------------------------------------------------
// fixtures (mirrors the T05/T12 harnesses)

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

/**
 * Stateful recording sound mock. `isMuted()` must reflect the last `setMuted`
 * value so the `mute` event payload and the `setMuted` argument stay in lockstep
 * (R-ARCH-04), and `play` records nothing while muted (R-TEST mute contract).
 */
function makeSound() {
  let muted = false;
  const played = [];
  const setMutedCalls = [];
  return {
    muted: () => muted,
    played,
    setMutedCalls,
    play: (name) => { if (!muted) played.push(name); },
    setMuted: (b) => { muted = Boolean(b); setMutedCalls.push(muted); },
    isMuted: () => muted,
  };
}

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
  };
}

/**
 * Full headless integration harness: real seeded core game + real engine,
 * mock graphics / sound / clock / no input, event collectors.
 *
 * Seed defaults to 26 (see the file header for the oracle derivation):
 * after `start()` first food { c:10, r:0 } sits north of head { c:10, r:8 }.
 */
function makeHarness({ seed = 26, leaderboard, sound } = {}) {
  const game = createGame({ rng: seededRng(seed) });
  const clock = makeClock();
  const snd = sound ?? makeSound();
  const graphics = { size: makeSpy(), render: makeSpy() };
  const events = { state: [], eat: [], death: [], mute: [] };
  const lb = leaderboard !== undefined
    ? leaderboard
    : createLeaderboard({ storage: memoryStorage(), initial: [], clock });
  const engine = createEngine({
    game, sound: snd, graphics, clock, leaderboard: lb,
    input: { install: () => () => {} },
  });
  for (const key of Object.keys(events)) {
    engine.on(key, (p) => events[key].push(p));
  }
  return {
    engine,
    game,
    events,
    clock,
    sound: snd,
    graphics,
    lb,
    gameState: () => engine.gameState(),
    head: () => engine.gameState().snake[0],
  };
}

/** Drive (1 ms frames) until exactly `n` core ticks have run, then restore. */
function driveTicks(f, n) {
  let count = 0;
  const realTick = f.game.tick;
  f.game.tick = function (...args) { count += 1; return realTick.apply(this, args); };
  try {
    for (let i = 0; i < n * 400 && count < n; i += 1) f.engine.update(1);
  } finally {
    f.game.tick = realTick;
  }
  return count;
}

/** Drive (1 ms frames) until the core reports `dead`, capped to avoid hangs. */
function driveToDead(f) {
  let guard = 0;
  while (f.gameState().state !== 'dead' && guard < 5000) {
    f.engine.update(1);
    guard += 1;
  }
  return f.gameState().state === 'dead';
}

// ---------------------------------------------------------------------------
// 1) start -> play -> eat

test('integration: start plays, seeded run reaches the food (eat + score + length)', () => {
  const f = makeHarness();
  assert.equal(f.gameState().state, 'menu');

  f.engine.start();
  assert.equal(f.gameState().state, 'playing');

  // Food { c:10, r:0 } is 8 cells north of the head; with no input the snake
  // drifts straight north and eats on the 8th tick.
  const ticks = driveTicks(f, 8);
  assert.equal(ticks, 8);

  const st = f.gameState();
  assert.equal(st.score, 10);
  assert.equal(st.snake.length, 4); // grew from 3 by one segment
  assert.equal(st.state, 'playing');

  // Exactly one `eat` event fired, at the food cell the head entered.
  assert.equal(f.events.eat.length, 1);
  assert.deepEqual(f.events.eat[0], { c: 10, r: 0 });

  // And after eating the head IS on that cell (authoritative snapshot check).
  assert.deepEqual({ c: f.head().c, r: f.head().r }, { c: 10, r: 0 });
});

// ---------------------------------------------------------------------------
// 2) steer into wall -> death

test('integration: drifting into the top wall fires death + dead state + deathCell', () => {
  const f = makeHarness();
  f.engine.start();

  // No input steering: after eating, the next tick leaves the grid through
  // the top wall (head crosses from r:0 to an out-of-bounds cell).
  const died = driveToDead(f);
  assert.ok(died, 'simulation should reach dead');

  const st = f.gameState();
  assert.equal(st.state, 'dead');
  assert.equal(st.alive, false);
  // The authoritative death cell is the out-of-bounds target, not the last
  // in-bounds cell.
  assert.deepEqual(st.deathCell, { c: 10, r: -1 });

  // The `death` event fired once with the loss payload (won:false).
  assert.equal(f.events.death.length, 1);
  assert.deepEqual(f.events.death[0], { c: 10, r: -1, won: false });

  // And exactly one trailing `state` event reports `dead`.
  const deadStates = f.events.state.filter((s) => s.state === 'dead');
  assert.equal(deadStates.length, 1);
});

// ---------------------------------------------------------------------------
// 3) start() again -> fresh snapshot, score 0

test('integration: start() from dead yields a fresh snapshot with score 0', () => {
  const f = makeHarness();
  f.engine.start();
  driveToDead(f); // force a loss
  assert.equal(f.gameState().state, 'dead');
  assert.ok(f.gameState().score > 0, 'expected a non-zero score on the run');

  f.engine.start(); // restart
  const st = f.gameState();
  assert.equal(st.state, 'playing');
  assert.equal(st.score, 0);
  assert.equal(st.snake.length, 3); // back to the initial length
  assert.equal(st.alive, true);
  assert.equal(st.won, false);
  assert.equal(st.deathCell, null);
});

// ---------------------------------------------------------------------------
// 4) pause -> no tick events even after 10 * TICK_MS of updates

test('integration: pause() suppresses all tick events for 10 * TICK_MS of updates', () => {
  const f = makeHarness();
  f.engine.start();
  driveTicks(f, 3); // warm up; confirm the sim is live
  assert.ok(f.gameState().state === 'playing');

  const ticksBefore = f.game.tick;
  let tickCount = 0;
  f.game.tick = function (...args) { tickCount += 1; return ticksBefore.apply(this, args); };

  f.engine.pause();
  assert.equal(f.gameState().state, 'paused');

  // A healthy full 10*TICK_MS of frames must not advance the simulation while
  // paused. The engine clamps each frame to <=100 ms, so 1 ms frames deliver
  // the requested budget exactly.
  let guard = 0;
  while (guard < 10 * TICK_MS) {
    f.engine.update(1);
    guard += 1;
  }
  f.game.tick = ticksBefore;

  assert.equal(tickCount, 0, 'no core ticks while paused');
  assert.equal(f.gameState().state, 'paused');
});

// ---------------------------------------------------------------------------
// 5) resume -> ticks resume

test('integration: resume() resumes the tick loop', () => {
  const f = makeHarness();
  f.engine.start();
  driveTicks(f, 2);

  f.engine.pause();
  assert.equal(f.gameState().state, 'paused');

  f.engine.resume();
  assert.equal(f.gameState().state, 'playing');

  const ticks = driveTicks(f, 2); // resume ticking after the pause
  assert.equal(ticks, 2);
});

// ---------------------------------------------------------------------------
// 6) mute -> setMuted(true) called by the engine + play suppressed while muted

test('integration: mute() routes through soundBackend.setMuted and suppresses play', () => {
  const f = makeHarness();

  // Use the RNG-independent `resume` blip (a pause/resume round-trip always
  // plays 'resume') so the mute assertions hold without depending on food RNG.
  f.engine.start();
  f.engine.pause();
  f.engine.resume();
  assert.deepEqual(f.sound.played, ['resume'], 'resume blip plays while unmuted');
  assert.equal(f.sound.setMutedCalls.length, 0);

  // Mute on: engine calls the backend's setMuted(true) and emits `mute`.
  f.engine.mute();
  assert.deepEqual(f.sound.setMutedCalls, [true]);
  assert.equal(f.sound.isMuted(), true);
  assert.equal(f.events.mute.length, 1);
  assert.deepEqual(f.events.mute[0], { muted: true });

  // While muted, a resume round-trip is suppressed by the backend.
  const before = f.sound.played.length;
  f.engine.pause();
  f.engine.resume();
  assert.equal(f.sound.played.length, before, 'no play recorded while muted');

  // Mute off: setMuted(false) restored; a later resume plays again.
  f.engine.mute();
  assert.deepEqual(f.sound.setMutedCalls, [true, false]);
  assert.equal(f.sound.isMuted(), false);
  assert.equal(f.events.mute.length, 2);
  assert.deepEqual(f.events.mute[1], { muted: false });
  f.engine.pause();
  f.engine.resume();
  assert.deepEqual(f.sound.played, ['resume', 'resume'], 'resume blip plays again after unmute');
});
