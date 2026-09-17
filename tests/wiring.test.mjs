// tests/wiring.test.mjs — T12: cross-module wiring, layering, and determinism
// gates (wave 5). Runs headless in Node (R-TEST-01): no `three`, no real DOM.
//
// This is the wave-5 gate for every wave-1..4 module. Five named tests, one per
// contract assertion in task-12 (R-IDs in the names so a failure pinpoints the
// broken contract):
//   1. R-ARCH-01 layering          — static import scan of the module graph.
//   2. R-ARCH-04 event bus         — state/eat/death/mute payload shapes.
//   3. R-ARCH-05 single source     — state payload == core snapshot (minus extras).
//   4. R-TEST-02 deterministic     — two same-seeded engines replay identically.
//   5. R-ARCH-03 injection points  — throwing leaderboard + provider-less boot.
//
// Mocks are defined here (per R-ARCH-02) and mirror the reviewed T05 harness
// (makeClock/makeSpy/memoryStorage/frames/driveTicks).
//
// Layering note (R-ARCH-01, source-true): the *real* invariant is that lower
// layers never import higher layers. `js/world/{floor,walls}.js` import their
// same-dir sibling `./materials.js` (pure material math, still a world-layer
// module); that is a legitimate world-internal import, NOT a cross-layer
// violation. The scan below therefore asserts the negative invariants (no
// up-layer import) that capture R-ARCH-01's intent and hold for this codebase.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createGame } from '../js/game/core.js';
import { createEngine } from '../js/engine/engine.js';
import { seededRng } from '../js/providers/rng.js';
import { createLeaderboard } from '../js/providers/leaderboard.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// fixtures (mirrors the T05 harness)

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

// Stateful sound: `isMuted()` must reflect the last `setMuted` value so the
// `mute` event payload and the `setMuted` argument stay in lockstep (R-ARCH-04).
function makeSound() {
  let muted = false;
  const mutedCalls = [];
  return {
    play: makeSpy(),
    setMuted: (b) => { muted = Boolean(b); mutedCalls.push(b); },
    isMuted: () => muted,
    mutedCalls,
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
 * Full headless harness: real seeded core game + engine + event collectors.
 * Defaults match the T05 food oracle (seed 11 -> first food { c:17, r:10 }).
 */
function makeEngine({ seed = 11, leaderboard, sound, input } = {}) {
  const game = createGame({ rng: seededRng(seed) });
  const clock = makeClock();
  const snd = sound ?? makeSound();
  const graphics = { size: makeSpy(), render: makeSpy() };
  const events = { state: [], eat: [], death: [], mute: [] };
  const inp = input ?? { install: () => () => {} };
  const lb = leaderboard !== undefined
    ? leaderboard
    : createLeaderboard({ storage: memoryStorage(), initial: [], clock });
  const engine = createEngine({ game, sound: snd, graphics, clock, leaderboard: lb, input: inp });
  for (const key of Object.keys(events)) engine.on(key, (p) => events[key].push(p));
  return {
    engine,
    game,
    events,
    clock,
    sound: snd,
    graphics,
    lb,
    head: () => engine.gameState().snake[0],
    gameState: () => engine.gameState(),
  };
}

/** Advance in 1 ms frames (avoids the 100 ms frame clamp; exact integer ms). */
function driveFrames(f, ms) {
  for (let i = 0; i < Math.round(ms); i += 1) f.engine.update(1);
}

/** Drive until exactly `n` core ticks have run, then restore the game's tick. */
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
  while (f.gameState().state !== 'dead' && guard < 5000) { f.engine.update(1); guard += 1; }
  return f.gameState().state === 'dead';
}

// ---------------------------------------------------------------------------
// 1) R-ARCH-01 layering — static import scan

/** Collect the module specifiers a file imports (static `from` + dynamic). */
function importSpecs(src) {
  const set = new Set();
  let m;
  const reStatic = /import\s+(?:[\s\S]*?)?\s*from\s+['"]([^'"]+)['"]/g;
  const reDynamic = /import\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((m = reStatic.exec(src)) !== null) set.add(m[1]);
  while ((m = reDynamic.exec(src)) !== null) set.add(m[1]);
  return set;
}

const JS_FILE = (f) => f.endsWith('.js');
function listJs(dir) { return readdirSync(dir).filter(JS_FILE); }
function isExternal(spec) { return !spec.startsWith('.'); }
function isThree(spec) { return spec === 'three' || spec.startsWith('three/'); }

test('T12 · R-ARCH-01 layering: import graph never reaches up across layer boundaries', () => {
  const WORLD_DIR = path.join(ROOT, 'js', 'world');
  const GAME_DIR = path.join(ROOT, 'js', 'game');
  const PROVIDERS_DIR = path.join(ROOT, 'js', 'providers');
  const ENGINE_FILE = path.join(ROOT, 'js', 'engine', 'engine.js');
  const WORLD_SEP = path.join(ROOT, 'js', 'world') + path.sep;
  const GAME_SEP = path.join(ROOT, 'js', 'game') + path.sep;
  const UI_SEP = path.join(ROOT, 'js', 'ui') + path.sep;
  const PROVIDERS_SEP = path.join(ROOT, 'js', 'providers') + path.sep;

  // --- js/world/*: only three + js/game/* + same-dir siblings (no up-layer) ---
  const worldAll = new Set();
  for (const file of listJs(WORLD_DIR)) {
    for (const spec of importSpecs(readFileSync(path.join(WORLD_DIR, file), 'utf8'))) {
      worldAll.add(spec);
      if (isExternal(spec)) {
        assert.ok(isThree(spec), `js/world/${file} imports external '${spec}' (only three allowed)`);
      } else {
        const abs = path.resolve(WORLD_DIR, spec);
        const inWorld = abs.startsWith(WORLD_SEP);   // same-dir sibling (e.g. ./materials.js)
        const inGame = abs.startsWith(GAME_SEP);     // core (e.g. ../game/core.js)
        // world must never import engine/providers/input/ui or anything else.
        const forbidden =
          abs.startsWith(PROVIDERS_SEP) ||
          (abs.includes(path.join('js', 'input')) && abs.startsWith(path.join(ROOT, 'js', 'input') + path.sep)) ||
          abs.startsWith(UI_SEP) ||
          abs.startsWith(path.join(ROOT, 'js', 'engine') + path.sep);
        assert.ok(inWorld || inGame, `js/world/${file} imports out-of-layer '${spec}'`);
        assert.ok(!forbidden, `js/world/${file} reaches up to a higher layer: '${spec}'`);
      }
    }
  }

  // --- js/game/* and js/providers/*: import nothing out of their own dir -----
  for (const [dirName, dir] of [['game', GAME_DIR], ['providers', PROVIDERS_DIR]]) {
    const dirSep = path.join(ROOT, 'js', dirName) + path.sep;
    for (const file of listJs(dir)) {
      for (const spec of importSpecs(readFileSync(path.join(dir, file), 'utf8'))) {
        assert.ok(!isExternal(spec), `js/${dirName}/${file} imports external '${spec}' (should import nothing out of dir)`);
        const abs = path.resolve(dir, spec);
        const inDir = abs.startsWith(dirSep);
        assert.ok(inDir, `js/${dirName}/${file} imports out of its dir: '${spec}'`);
      }
    }
  }

  // --- js/engine/engine.js: may import game/input/providers/three; never
  //     js/world/* or js/ui/* (R-ARCH-01) ----------------------------------
  const engineSpecs = importSpecs(readFileSync(ENGINE_FILE, 'utf8'));
  for (const spec of engineSpecs) {
    if (isExternal(spec)) {
      assert.ok(isThree(spec), `js/engine/engine.js imports external '${spec}' (only three allowed)`);
    } else {
      const abs = path.resolve(path.join(ROOT, 'js', 'engine'), spec);
      assert.ok(!abs.startsWith(WORLD_SEP), `js/engine/engine.js imports js/world/*: '${spec}'`);
      assert.ok(!abs.startsWith(UI_SEP), `js/engine/engine.js imports js/ui/*: '${spec}'`);
    }
  }

  // --- self-check: the scanner really parsed imports (guards a broken regex) --
  assert.ok(worldAll.has('three'), 'world scan found no `three` import (scanner broken?)');
  assert.ok(worldAll.has('../game/core.js'), 'world scan found no `js/game/core.js` import (scanner broken?)');
  assert.ok(engineSpecs.has('../game/core.js'), 'engine scan found no `js/game/core.js` import (scanner broken?)');
});

// ---------------------------------------------------------------------------
// 2) R-ARCH-04 event bus — payload shapes

test('T12 · R-ARCH-04 event bus: state/eat/death/mute payloads are well-formed', () => {
  const f = makeEngine({ seed: 11 });
  const coreKeys = Object.keys(f.game.state()); // authoritative R-ARCH-05 key set
  const expectedKeys = [...new Set([...coreKeys, 'length', 'best', 'top'])].sort();
  const assertShape = (p, label) => {
    assert.deepEqual(Object.keys(p).sort(), expectedKeys, `state payload (${label}) has wrong key set`);
    assert.equal(p.length, p.snake.length, `state payload (${label}) length != snake.length`);
  };

  f.engine.start();
  assert.equal(f.events.state.length, 1);
  f.events.state.forEach((p) => assertShape(p, 'start'));

  // Force an `eat`: seed 11 first food is { c:17, r:10 } (T05 oracle).
  const foodBefore = f.gameState().food;
  f.engine.turn({ c: 1, r: 0 }); driveTicks(f, 7); // east -> (17,8)
  f.engine.turn({ c: 0, r: 1 }); driveTicks(f, 2); // south -> (17,10) eats
  assert.equal(f.events.eat.length, 1, 'exactly one `eat` event expected');
  assert.equal(f.events.eat[0].c, foodBefore.c, '`eat` c != the food cell just consumed');
  assert.equal(f.events.eat[0].r, foodBefore.r, '`eat` r != the food cell just consumed');
  assert.equal(f.gameState().score, 10, 'score not advanced by the eat');
  assertShape(f.events.state.at(-1), 'after eat');

  // Force a loss `death`: continue south into the wall; `death` must mirror the
  // core `deathCell` / `won` flags.
  assert.ok(driveToDead(f), 'snake never reached `dead`');
  assert.equal(f.events.death.length, 1, 'exactly one `death` event expected (loss)');
  const loss = f.events.death[0];
  const deadSnap = f.gameState();
  assert.equal(deadSnap.state, 'dead');
  assert.equal(loss.won, false, 'loss `death.won` must be false');
  assert.equal(loss.c, deadSnap.deathCell.c, 'loss `death.c` != core deathCell.c');
  assert.equal(loss.r, deadSnap.deathCell.r, 'loss `death.r` != core deathCell.r');
  f.events.state.forEach((p) => assertShape(p, 'after death'));

  // Win `death`: a scripted winning tick yields { c:null, r:null, won:true }.
  const w = makeEngine({ seed: 3 });
  w.engine.start();
  w.game.tick = function () {
    this.food = null; this.won = true; this.alive = false;
    this.phase = 'dead'; this.deathCell = null;
    return this.state();
  };
  driveTicks(w, 1);
  assert.equal(w.events.death.length, 1, 'exactly one `death` event expected (win)');
  assert.deepEqual(w.events.death[0], { c: null, r: null, won: true }, 'win `death` payload');

  // `mute` carries { muted } and `sound.setMuted` was called with the same flag.
  f.engine.mute();
  assert.equal(f.events.mute.length, 1, 'exactly one `mute` event expected');
  const m = f.events.mute[0];
  assert.equal(f.sound.mutedCalls.at(-1), true, '`sound.setMuted` not called with `true`');
  assert.equal(m.muted, f.sound.mutedCalls.at(-1), '`mute` payload flag != setMuted argument');
  assert.deepEqual(m, { muted: true }, '`mute` payload shape');
});

// ---------------------------------------------------------------------------
// 3) R-ARCH-05 snapshot single source

test('T12 · R-ARCH-05 snapshot: state payload minus engine keys == core game.state()', () => {
  const f = makeEngine({ seed: 11 });
  const strip = (p) => {
    const { length, best, top, ...rest } = p;
    void length; void best; void top;
    return rest;
  };
  const equalCore = (p, label) => {
    const rest = strip(p);
    assert.equal(JSON.stringify(rest), JSON.stringify(f.game.state()),
      `state payload (${label}) minus length/best/top is not JSON-identical to game.state()`);
    assert.equal(p.length, rest.snake.length, `state payload (${label}) re-derived length`);
  };

  f.engine.start();
  equalCore(f.events.state[0], 'start');

  // After an eat the snapshot must still be a verbatim copy of the core state,
  // never a re-derivation of a core field.
  f.engine.turn({ c: 1, r: 0 }); driveTicks(f, 7);
  f.engine.turn({ c: 0, r: 1 }); driveTicks(f, 2);
  assert.equal(f.events.eat.length, 1, 'expected an eat to exercise the post-eat snapshot');
  equalCore(f.events.state.at(-1), 'after eat');
  assert.equal(f.gameState().score, 10, 'score should be 10 after one eat');
});

// ---------------------------------------------------------------------------
// 4) R-TEST-02 deterministic replay

function runReplay({ muteAt = null } = {}) {
  const game = createGame({ rng: seededRng(42) });
  const clock = makeClock();
  const lb = createLeaderboard({ storage: memoryStorage(), initial: [], clock });
  const engine = createEngine({
    game, sound: makeSound(),
    graphics: { size() {}, render() {} }, clock, leaderboard: lb,
    input: { install: () => () => {} },
  });
  let lastStatePayload = null;
  engine.on('state', (p) => { lastStatePayload = p; });
  engine.start();

  const FRAMES = 28;
  const turnAt = { 2: { c: 1, r: 0 }, 12: { c: 0, r: 1 } }; // same scripted sequence
  const steps = [];
  for (let i = 0; i < FRAMES; i += 1) {
    if (turnAt[i]) engine.turn(turnAt[i]);
    engine.update(160); // identical 160 ms clock stepping (R-TEST-02)
    const snap = engine.gameState();
    steps.push({
      head: { c: snap.snake[0].c, r: snap.snake[0].r },
      score: snap.score,
      food: snap.food ? { c: snap.food.c, r: snap.food.r } : null,
      state: snap.state,
    });
    if (muteAt !== null && i === muteAt) engine.mute();
  }
  return { steps, lastStatePayload };
}

test('T12 · R-TEST-02 replay: two same-seeded engines are identical; mute is inert', () => {
  const A = runReplay({});
  const B = runReplay({});
  const C = runReplay({ muteAt: 14 }); // mutes mid-game; gameplay must be unperturbed

  assert.equal(A.steps.length, B.steps.length, 'replays have a different number of steps');
  assert.equal(C.steps.length, A.steps.length, 'muted replay has a different number of steps');

  for (let i = 0; i < A.steps.length; i += 1) {
    assert.deepEqual(A.steps[i].head, B.steps[i].head, `step ${i}: head mismatch A vs B`);
    assert.equal(A.steps[i].score, B.steps[i].score, `step ${i}: score mismatch A vs B`);
    assert.deepEqual(A.steps[i].food, B.steps[i].food, `step ${i}: food mismatch A vs B`);

    // Mute must not perturb the simulation: C agrees with A on every gameplay field.
    assert.deepEqual(C.steps[i].head, A.steps[i].head, `step ${i}: muted head drifts from A`);
    assert.equal(C.steps[i].score, A.steps[i].score, `step ${i}: muted score drifts from A`);
    assert.deepEqual(C.steps[i].food, A.steps[i].food, `step ${i}: muted food drifts from A`);
  }

  // Identical final `state` payload.
  assert.equal(JSON.stringify(A.lastStatePayload), JSON.stringify(B.lastStatePayload),
    'final state payload differs between the two same-seeded engines');
});

// ---------------------------------------------------------------------------
// 5) R-ARCH-03 injection points

test('T12 · R-ARCH-03 injection: throwing leaderboard is swallowed; provider-less engine boots', () => {
  // 5a. A leaderboard whose storage throws must not crash the engine on a death
  //     `submit` (R-ARCH-03 puts that robustness in the *provider*: a throwing
  //     storage falls back to in-memory). Gameplay continues to `state 'dead'`.
  const throwingStorage = {
    load: () => { throw new Error('storage load fail'); },
    save: () => { throw new Error('storage save fail'); },
  };
  const lb = createLeaderboard({ storage: throwingStorage, initial: [], clock: makeClock() });
  const f = makeEngine({ seed: 11, leaderboard: lb });

  const logCalls = [];
  const orig = { error: console.error, warn: console.warn, log: console.log };
  console.error = console.warn = console.log = (...a) => { logCalls.push(a); };
  let threw = false;
  try {
    f.engine.start();
    f.engine.turn({ c: 1, r: 0 }); // east -> right wall
    driveToDead(f);
  } catch { threw = true; } finally {
    console.error = orig.error; console.warn = orig.warn; console.log = orig.log;
  }
  assert.equal(threw, false, 'engine crashed on a throwing leaderboard during `submit`');
  assert.equal(f.gameState().state, 'dead', 'gameplay did not continue to `state \'dead\'`');
  assert.equal(f.events.death.length, 1, 'no `death` after a throwing leaderboard');
  assert.equal(logCalls.length, 0, 'engine/provider logged something (contract: logs nothing)');
  // The score was still recorded via the provider's in-memory fallback.
  assert.equal(lb.list().length, 1, 'throwing leaderboard did not fall back to memory');
  assert.equal(lb.best(), f.gameState().score, 'submitted score != run score after fallback');

  // 5b. An engine built without ANY provider still boots with sane defaults.
  const g = createGame({}); // no rng -> default Math.random
  const engine = createEngine({ game: g });
  assert.equal(engine.quality, 'standard', 'default quality tier must be `standard`');
  assert.equal(engine.leaderboard, null, 'no injected/game leaderboard -> engine.leaderboard is null');
  assert.equal(g.rng, Math.random, 'no injected rng -> core defaults to Math.random');
  assert.equal(engine.gameState().state, 'menu', 'provider-less engine did not boot to `menu`');
  let saw = null;
  engine.on('state', (p) => { saw = p; });
  assert.doesNotThrow(() => engine.start(), 'provider-less engine failed to `start()`');
  assert.equal(engine.gameState().state, 'playing', 'provider-less engine did not reach `playing`');
  assert.deepEqual(saw.top, [], 'provider-less engine `state` should have an empty board');
  assert.equal(saw.best, 0, 'provider-less engine `state` best should be 0');
});
