// T12 (wiring) — cross-module gate for all of wave 1..4 before real WebGL.
// Static layering scan (R-ARCH-01), event-bus contract (R-ARCH-04), snapshot
// single-source (R-ARCH-05), deterministic replay (R-TEST-02), and injection
// points (R-ARCH-03). Node-only; no real DOM beyond the fakes defined here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { GameEngine, createEngine } from '../js/engine/engine.js';
import { createGame } from '../js/game/core.js';
import { seededRng } from '../js/providers/rng.js';
import { createLeaderboard } from '../js/providers/leaderboard.js';

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
const JS_DIR = resolve(THIS_DIR, '..', 'js');

// Snapshot keys that core.state() produces (R-ARCH-05). Engine adds length|
// best|top (R-ARCH-04). Every other key in a state evt would be a bug.
const SNAPSHOT_KEYS = ['state', 'snake', 'direction', 'food', 'score', 'alive', 'won', 'deathCell'];
const ENGINE_KEYS = ['length', 'best', 'top'];
const ALL_STATE_KEYS = [...SNAPSHOT_KEYS, ...ENGINE_KEYS];

// =====================================================================
// Test 1: Layering (R-ARCH-01) — static import scan
// =====================================================================
function listJsFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = resolve(dir, name);
    if (statSync(p).isDirectory()) listJsFiles(p, out);
    else if (name.endsWith('.js')) out.push(p);
  }
  return out;
}

function topCategory(absPath) {
  // The first path segment under js/, or 'root' for files directly in js/.
  const norm = absPath.split(/[/\\]/).join('/');
  const idx = norm.indexOf('/js/');
  const rest = norm.slice(idx + '/js/'.length).split('/');
  return rest.length <= 1 ? 'root' : rest[0];
}

function importSources(src) {
  const out = [];
  for (const m of src.matchAll(/import\s+(?:[^\n]*?from\s+)?['"]([^'"]+)['"]/g)) {
    out.push(m[1]);
  }
  return out;
}

// Resolve a relative import against the file dir; return its top dir under
// js/, or 'three' for the package, else null.
function resolveImport(fileAbs, spec) {
  if (spec === 'three' || spec.startsWith('three/')) return { kind: 'three' };
  if (spec.startsWith('./') || spec.startsWith('../')) {
    const target = resolve(dirname(fileAbs), spec);
    return { kind: 'js', cat: topCategory(target) };
  }
  // bare non-three package -> external (not the only-dep rule).
  return { kind: 'external', spec };
}

// Allowed top-dir imports for each layer.
const ALLOWED = {
  world: new Set(['three', 'world', 'game']),
  game: new Set(['game']),
  providers: new Set(['providers']),
  input: new Set(['input']),
  ui: new Set(['ui', 'game']),
  engine: new Set(['engine', 'game', 'input', 'providers', 'three']),
  root: new Set(['three', 'world', 'game', 'providers', 'input', 'ui', 'engine']), // main.js (T13)
};

test('Layering (R-ARCH-01): every module imports only from its allowed layers', () => {
  const files = listJsFiles(JS_DIR);
  assert.ok(files.length > 0, 'found js modules');
  const violations = [];
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    const cat = topCategory(f);
    if (!ALLOWED[cat]) continue;
    const allowed = ALLOWED[cat];
    for (const spec of importSources(src)) {
      const r = resolveImport(f, spec);
      if (r.kind === 'external') {
        violations.push(`${cat}/${spec}: external package ${spec} (only three is allowed)`);
      } else if (!allowed.has(r.kind === 'three' ? 'three' : r.cat)) {
        violations.push(`${cat} imported ${spec} -> ${r.kind}:${r.cat} (not allowed for ${cat})`);
      }
    }
  }
  assert.deepEqual(violations, [], `layering violations:\n${violations.join('\n')}`);

  // Explicit, pointed checks (pinpoint failures):
  const engineSrc = readFileSync(resolve(JS_DIR, 'engine', 'engine.js'), 'utf8');
  for (const spec of importSources(engineSrc)) {
    const r = resolveImport(resolve(JS_DIR, 'engine', 'engine.js'), spec);
    if (r.kind !== 'three') {
      assert.ok(r.cat !== 'world' && r.cat !== 'ui', `engine.js must not import ${spec}`);
    }
  }
  // ui files must never import world/engine/three.
  for (const f of listJsFiles(resolve(JS_DIR, 'ui'))) {
    const src = readFileSync(f, 'utf8');
    for (const spec of importSources(src)) {
      const r = resolveImport(f, spec);
      assert.ok(!(r.kind === 'three'), `ui must not import three (${spec})`);
      if (r.kind !== 'three') {
        assert.ok(r.cat !== 'world' && r.cat !== 'engine', `ui must not import world/engine (${spec})`);
      }
    }
  }
});

// =====================================================================
// Test 2: Event bus (R-ARCH-04)
// =====================================================================
function fakeClock(t = 0) {
  return { t, now() { return this.t; }, add(ms) { this.t += ms; } };
}
function mockGraphics() {
  const g = { sizes: [], renders: [] };
  g.size = (w, h) => g.sizes.push([w, h]);
  g.render = (snap) => g.renders.push(snap);
  return g;
}
function spySound(muted = true) {
  let m = muted;
  return {
    plays: [],
    setMutedCalls: [],
    play(n) { this.plays.push(n); },
    setMuted(x) { this.setMutedCalls.push(x); m = x; },
    isMuted() { return m; },
  };
}
function memStorage() {
  let v = null;
  return { load: () => v, save: (j) => { v = j; } };
}


test('Event bus (R-ARCH-04): state/eat/death/mute payloads carry exactly the contract keys', () => {
  const game = createGame({ rng: seededRng(99) });
  const clock = fakeClock();
  const lb = createLeaderboard({ storage: memStorage(), now: () => 5 });
  const sound = spySound(false);
  const engine = new GameEngine({ game, clock, graphics: mockGraphics(), sound, leaderboard: lb });

  const seen = { state: [], eat: [], death: [], mute: [] };
  engine.on('state', (p) => seen.state.push(p));
  engine.on('eat', (p) => seen.eat.push(p));
  engine.on('death', (p) => seen.death.push(p));
  engine.on('mute', (p) => seen.mute.push(p));

  engine.start();

  // Force an eat: place food one cell ahead of the head, then one tick.
  const head = game.state().snake[0];
  const dir = game.state().direction;
  const fc = head.c + dir.c;
  const fr = head.r + dir.r;
  game._s.food = { c: fc, r: fr };
  // Two update(100) = 200ms > 160ms base tick -> exactly one tick (it eats).
  engine.update(100);
  engine.update(100);

  assert.ok(seen.eat.length >= 1, 'an eat event fired');
  const eat = seen.eat[0];
  // eat payload is exactly {c, r}
  assert.deepEqual(Object.keys(eat).sort(), ['c', 'r'], 'eat payload keys');
  assert.deepEqual(eat, { c: fc, r: fr }, 'eat carries the eaten cell');

  // Every state payload: exactly snapshot keys + length/best/top.
  for (const st of seen.state) {
    assert.deepEqual(
      Object.keys(st).sort(),
      ALL_STATE_KEYS.slice().sort(),
      `state evt keys mismatch, got ${Object.keys(st).sort()}`
    );
    assert.equal(st.length, st.snake.length, 'length === snake.length (single source)');
  }

  // Mute: one toggle -> {muted:true} and sound.setMuted(true).
  engine.mute();
  assert.ok(seen.mute.length >= 1, 'a mute event fired');
  const mute = seen.mute[seen.mute.length - 1];
  assert.deepEqual(mute, { muted: true }, 'mute payload is exactly {muted}');
  assert.ok(sound.setMutedCalls.includes(true), 'sound.setMuted(true) was called');

  // Force a wall death: turn toward a wall then advance.
  const beforeDeath = seen.death.length;
  engine.turn({ c: 0, r: -1 }); // drive north from r=8 -> wall in <=8 ticks
  for (let i = 0; i < 40 && game.state().state === 'playing'; i++) engine.update(100);
  assert.equal(game.state().state, 'dead', 'reached dead');
  assert.equal(seen.death.length, beforeDeath + 1, 'exactly one death event');
  const d = seen.death[beforeDeath];
  const dc = game.state().deathCell;
  assert.equal(d.won, false, 'loss -> won false');
  assert.equal(d.c, dc.c);
  assert.equal(d.r, dc.r);
  // last state after death is the dead/won snapshot
  const lastState = seen.state[seen.state.length - 1];
  assert.equal(lastState.state, 'dead');
});

// =====================================================================
// Test 3: Snapshot single source (R-ARCH-05)
// =====================================================================
test('Snapshot single source (R-ARCH-05): state evt minus engine keys == core.state()', () => {
  const game = createGame({ rng: seededRng(7) });
  const clock = fakeClock();
  const lb = createLeaderboard({ storage: memStorage(), now: () => 5 });
  const engine = new GameEngine({ game, clock, graphics: mockGraphics(), sound: spySound(false), leaderboard: lb });
  let lastEvt = null;
  engine.on('state', (p) => { lastEvt = p; });

  engine.start();
  for (let i = 0; i < 50 && game.state().state === 'playing'; i++) engine.update(20);

  // Force a FRESH state event (an eat) right before the comparison so that
  // `lastEvt` reflects the very same instant as game.state(). State events
  // fire only on start/eat/death, so without this the last payload would be
  // stale (still the start snapshot). Place food one cell ahead of the head.
  const head = game.state().snake[0];
  const dir = game.state().direction;
  game._s.food = { c: head.c + dir.c, r: head.r + dir.r };
  // Two update(100) = 200ms > 160ms base tick -> exactly one tick (it eats).
  engine.update(100);
  engine.update(100);

  assert.ok(lastEvt, 'a state event was emitted');
  assert.ok(game.state().score > 0, 'the eat landed (score advanced)');
  const stripped = { ...lastEvt };
  delete stripped.length;
  delete stripped.best;
  delete stripped.top;
  assert.equal(
    JSON.stringify(stripped),
    JSON.stringify(game.state()),
    'engine payload never re-derives or rephrases a core field'
  );
  // length must equal the snake length in the SAME core snapshot.
  assert.equal(lastEvt.length, game.state().snake.length);
});

// =====================================================================
// Test 4: Deterministic replay (R-TEST-02)
// =====================================================================
function scriptedTurnSequence(step) {
  // A fixed, fully-deterministic turn pattern.
  const seq = [{ c: 0, r: -1 }, { c: 1, r: 0 }, { c: 0, r: 1 }, { c: -1, r: 0 }];
  return seq[step % 4];
}

function playThrough({ muteMid = false }) {
  const game = createGame({ rng: seededRng(42) });
  const clock = fakeClock();
  const lb = createLeaderboard({ storage: memStorage(), now: () => 5 });
  const engine = new GameEngine({ game, clock, graphics: mockGraphics(), sound: spySound(false), leaderboard: lb });
  engine.start();
  const heads = [];
  const scores = [];
  const foods = [];
  let lastState = null;
  engine.on('state', (p) => { lastState = p; });
  // 60 step pattern; one tick per step via a 160ms clock step.
  for (let step = 0; step < 60 && game.state().state === 'playing'; step++) {
    engine.turn(scriptedTurnSequence(step));
    clock.add(160);
    engine.update(160);
    const h = game.state().snake[0];
    heads.push({ c: h.c, r: h.r });
    scores.push(game.state().score);
    const f = game.state().food;
    foods.push(f ? { c: f.c, r: f.r } : null);
    if (muteMid && step === 20) engine.mute();
  }
  return { heads, scores, foods, final: game.state() };
}

test('Deterministic replay (R-TEST-02): seeded same-rng replay is identical; mute does not perturb', () => {
  const a = playThrough({ muteMid: false });
  const b = playThrough({ muteMid: true });
  assert.deepEqual(a.heads, b.heads, 'head positions identical with/without mute');
  assert.deepEqual(a.scores, b.scores, 'scores identical');
  assert.deepEqual(a.foods, b.foods, 'food cells identical');
  assert.deepEqual(a.final, b.final, 'final state payload identical');

  // And a fresh third run with no mute must equal the unmuted one byte-for-byte.
  const c = playThrough({ muteMid: false });
  assert.deepEqual(a.final, c.final, 'unmuted runs are deterministic');
  assert.deepEqual(a.scores, c.scores, 'score trace deterministic');
});

// =====================================================================
// Test 5: Injection points (R-ARCH-03)
// =====================================================================
test('Injection points (R-ARCH-03): throwing leaderboard survives death; no-provider boot defaults', () => {
  // (a) Throwing leaderboard: death submission must NOT crash the engine.
  const game = createGame({ rng: seededRng(3) });
  const clock = fakeClock();
  const throwingLb = { list: () => [], submit: () => { throw new Error('storage down'); } };
  const engine = new GameEngine({
    game,
    clock,
    graphics: mockGraphics(),
    sound: spySound(false),
    quality: 'standard',
    leaderboard: throwingLb,
  });
  const deathSeen = [];
  engine.on('death', (p) => deathSeen.push(p));
  engine.start();
  engine.turn({ c: -1, r: 0 }); // drive west from c=10 -> wall
  let crashed = false;
  try {
    for (let i = 0; i < 40 && game.state().state === 'playing'; i++) engine.update(100);
  } catch (e) {
    crashed = true;
  }
  assert.equal(crashed, false, 'engine did not crash when leaderboard threw');
  assert.equal(game.state().state, 'dead', 'gameplay continued to dead');
  assert.ok(deathSeen.length >= 1, 'death event still emitted despite leaderboard fault');

  // (b) No-provider boot: defaults Math.random / in-memory leaderboard / 'standard'.
  const bare = createEngine();
  assert.equal(bare.quality, 'standard');
  assert.equal(bare.game.state().state, 'menu');
  assert.equal(typeof bare.leaderboard.list, 'function');
  bare.start();
  assert.equal(bare.game.state().state, 'playing');
});
