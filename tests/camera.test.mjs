// tests/camera.test.mjs — T10 acceptance (R-CINE-01, R-WORLD-08, R-PERF-04).
//
// Maps each acceptance bullet to >= 1 test. Pure pose/oracle + Shake arithmetic
// run in Node. `CameraRig` composition is exercised headless (three's Vector3
// works without a GPU).
//
// NO-ALLOCATION (R-PERF-04) — code-review note, NOT a runtime assertion here:
// all Vector3s in CameraRig.update are the module-level singleton LOOK_TARGET
// (plus the camera's own position vector, written in-place). Nothing is
// `new`ed per frame. Verified by inspection, deliberately not asserted at
// runtime (a WeakSet allocation smoke is brittle and non-deterministic).
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { cellToWorld } from '../js/game/core.js';
import {
  cameraPose,
  Shake,
  CameraRig,
  T_DOLLY,
  DEATH_AMP,
} from '../js/world/camera.js';

function approx(actual, expected, eps, msg) {
  assert.ok(
    Math.abs(actual - expected) <= eps,
    (msg ? msg + ': ' : '') + `expected ${actual} within ${eps} of ${expected}`
  );
}

function approxVec(v, e, eps) {
  approx(v.x, e.x, eps, 'x');
  approx(v.y, e.y, eps, 'y');
  approx(v.z, e.z, eps, 'z');
}

const TAU = Math.PI * 2;

// --- independent oracles (recomputed here, not imported) ---------------------
// menu orbit
function menuPose(t) {
  const angle = (TAU * t) / 60;
  return { position: { x: 20 * Math.cos(angle), y: 12, z: 20 * Math.sin(angle) }, target: { x: 0, y: 0, z: 0 } };
}
// playing/paused base pose (Lissajous, position-only)
function playingPose(t) {
  return {
    position: { x: 0.15 * Math.sin(0.11 * t), y: 13, z: 17.5 + 0.15 * Math.sin(0.07 * t) },
    target: { x: 0, y: 0, z: 0 },
  };
}
// low-3/4 position for a death cell (axis-aligned +z convention)
function low34(c, r) {
  const w = cellToWorld(c, r);
  return { x: w.x, y: 0 + 3, z: w.z + 8 };
}

// ===========================================================================
// cameraPose — menu
// ===========================================================================
test('menu pose at t=0 orbits at radius 20, height 12, angle 0', () => {
  const e = menuPose(0);
  const p = cameraPose({ state: 'menu', t: 0 });
  approx(p.position.x, 20, 1e-6, 'x');
  approx(p.position.z, 0, 1e-6, 'z');
  approx(p.position.y, 12, 1e-6, 'y');
  approxVec(p.position, e.position, 1e-6);
  approxVec(p.target, { x: 0, y: 0, z: 0 }, 1e-9);
});

test('menu pose at t=30 orbits to angle pi (opposite point)', () => {
  const p = cameraPose({ state: 'menu', t: 30 });
  approx(p.position.x, -20, 1e-6, 'x');
  approx(p.position.z, 0, 1e-6, 'z');
  approx(p.position.y, 12, 1e-6, 'y');
  const r = Math.hypot(p.position.x, p.position.z);
  approx(r, 20, 1e-6, 'radius');
  approxVec(p.target, { x: 0, y: 0, z: 0 }, 1e-9);
});

test('menu pose stays on the circle of radius 20 at arbitrary t', () => {
  for (const t of [10, 25, 42, 60]) {
    const p = cameraPose({ state: 'menu', t }).position;
    approx(Math.hypot(p.x, p.z), 20, 1e-6, `r @ t=${t}`);
    approx(p.y, 12, 1e-6, `y @ t=${t}`);
  }
});

// ===========================================================================
// cameraPose — playing / paused
// ===========================================================================
test('playing pose at t=0 is exactly (0, 13, 17.5)', () => {
  const p = cameraPose({ state: 'playing', t: 0 });
  approxVec(p.position, { x: 0, y: 13, z: 17.5 }, 1e-9);
  approxVec(p.target, { x: 0, y: 0, z: 0 }, 1e-9);
});

test('playing pose at t=10 has Lissajous offsets 0.15 sin(1.1), 0.15 sin(0.7)', () => {
  const p = cameraPose({ state: 'playing', t: 10 });
  approx(p.position.x, 0.15 * Math.sin(1.1), 1e-4, 'x');
  approx(p.position.z, 17.5 + 0.15 * Math.sin(0.7), 1e-4, 'z');
  approx(p.position.y, 13, 1e-4, 'y');
  approxVec(p.target, { x: 0, y: 0, z: 0 }, 1e-9);
});

test('paused pose equals the playing pose (same Lissajous, position-only)', () => {
  const t = 7.3;
  const a = cameraPose({ state: 'paused', t });
  const b = cameraPose({ state: 'playing', t });
  approxVec(a.position, b.position, 1e-12);
  approxVec(a.target, b.target, 1e-12);
});

// ===========================================================================
// cameraPose — dead (not won) dolly
// ===========================================================================
const DC = { c: 5, r: 5 };

test('dead (not won) at tSinceDeath=0 equals the current playing pose position', () => {
  const t = 10; // non-zero so the Lissajous offset is exercised
  const base = playingPose(t);
  const p = cameraPose({ state: 'dead', t, deathCell: DC, tSinceDeath: 0, won: false });
  approxVec(p.position, base.position, 1e-9);
  // target already locks onto the death-cell world position at dolly start
  const dw = cellToWorld(DC.c, DC.r);
  approxVec(p.target, { x: dw.x, y: 0, z: dw.z }, 1e-9);
});

test('dead dolly at tSinceDeath=T_DOLLY/2 is the midpoint (smoothstep ~0.5)', () => {
  const t = 0; // base is the exact (0,13,17.5) so the midpoint is clean
  const a = playingPose(t).position;
  const z = low34(DC.c, DC.r);
  const mid = {
    x: (a.x + z.x) / 2,
    y: (a.y + z.y) / 2,
    z: (a.z + z.z) / 2,
  };
  const p = cameraPose({ state: 'dead', t, deathCell: DC, tSinceDeath: T_DOLLY / 2, won: false });
  approxVec(p.position, mid, 1e-3);
  // smoothstep at u=0.5 is exactly 0.5
  const u = 0.5;
  approx(u * u * (3 - 2 * u), 0.5, 1e-12, 'smoothstep(0.5)');
});

test('dead dolly at tSinceDeath=T_DOLLY+5 holds the exact low-3/4 pose', () => {
  const t = 3;
  const z = low34(DC.c, DC.r);
  const p = cameraPose({ state: 'dead', t, deathCell: DC, tSinceDeath: T_DOLLY + 5, won: false });
  approxVec(p.position, z, 1e-6);
  const dw = cellToWorld(DC.c, DC.r);
  approxVec(p.target, { x: dw.x, y: 0, z: dw.z }, 1e-9);
});

test('T_DOLLY is the pinned 1.5 s', () => {
  assert.equal(T_DOLLY, 1.5);
});

// ===========================================================================
// cameraPose — dead (won)
// ===========================================================================
test('dead with won=true equals the playing pose (no dolly)', () => {
  const t = 6;
  const base = playingPose(t);
  const p = cameraPose({ state: 'dead', t, deathCell: null, tSinceDeath: 0, won: true });
  approxVec(p.position, base.position, 1e-9);
  approxVec(p.target, { x: 0, y: 0, z: 0 }, 1e-9);
});

// ===========================================================================
// Shake
// ===========================================================================
function shakeAngle(t0) {
  const h = (t0 * 2654435761) >>> 0;
  return (h % 62832) / 10000;
}

test('Shake single push 0.45 gives magnitude 0.45 along its hash axis at t0', () => {
  const NOW = 1000;
  const sh = new Shake(() => NOW);
  sh.push(0.45); // t0 = 1000
  const o = sh.offset(NOW);
  const ang = shakeAngle(NOW);
  approx(Math.hypot(o.x, o.z), 0.45, 1e-3, 'x/z magnitude');
  approx(o.x, 0.45 * Math.cos(ang), 1e-3, 'x');
  approx(o.z, 0.45 * Math.sin(ang), 1e-3, 'z');
  approx(o.y, 0.45 * 0.3, 1e-3, 'y (0.3 scale)');
});

test('Shake impulse decays: at t0+100 magnitude ~= 0.45*exp(-0.6)', () => {
  const NOW = 1000;
  const sh = new Shake(() => NOW);
  sh.push(0.45);
  const o = sh.offset(NOW + 100);
  const expected = 0.45 * Math.exp(-6 * (100 / 1000));
  approx(Math.hypot(o.x, o.z), expected, 1e-3, 'decayed magnitude');
});

test('Shake overlapping large amplitudes sum and clamp at 0.5', () => {
  // now advances per push so the three t0s differ (0, 50, 100 ms).
  let nowMs = 1000;
  const sh = new Shake(() => {
    const v = nowMs;
    nowMs += 50;
    return v;
  });
  sh.push(0.45); // t0=1000
  sh.push(0.45); // t0=1050
  sh.push(0.45); // t0=1100
  const o = sh.offset(1100);
  // raw sum > 0.5, so total must be pinned to the clamp
  const rawSum =
    0.45 * Math.exp(-6 * 100 / 1000) +
    0.45 * Math.exp(-6 * 50 / 1000) +
    0.45;
  assert.ok(rawSum > 0.5, `raw sum ${rawSum} should exceed clamp`);
  approx(Math.hypot(o.x, o.z), 0.5, 1e-6, 'clamped to 0.5');
});

test('Shake is deterministic: identical now sequences -> identical offsets', () => {
  function make() {
    let nowMs = 4242;
    const sh = new Shake(() => nowMs++);
    return sh;
  }
  const seq = [0.45, 0.1, 0.5, 0.2, 0.3, 0.45, 0.08, 0.9];
  const BASE = 4242;
  const a = make();
  const b = make();
  for (const amp of seq) {
    a.push(amp);
    b.push(amp);
  }
  for (const dt of [0, 10, 120, 300, 900, 1199, 2000]) {
    const oa = a.offset(BASE + dt);
    const ob = b.offset(BASE + dt);
    assert.equal(oa.x, ob.x, `x @ +${dt}`);
    assert.equal(oa.y, ob.y, `y @ +${dt}`);
    assert.equal(oa.z, ob.z, `z @ +${dt}`);
  }
});

test('Shake drops an impulse older than 1.2 s (offset returns zero)', () => {
  const sh = new Shake(() => 1000);
  sh.push(0.45); // t0=1000
  // just inside expiry: still active
  const inside = sh.offset(1000 + 1199);
  assert.ok(Math.hypot(inside.x, inside.z) > 0, 'should still be active at +1199ms');
  // past expiry: dropped -> zero
  const o = sh.offset(1000 + 1201);
  assert.equal(o.x, 0, 'x expired');
  assert.equal(o.y, 0, 'y expired');
  assert.equal(o.z, 0, 'z expired');
});

test('Shake overwrites the oldest slot once 8 impulses are held', () => {
  let nowMs = 0;
  const sh = new Shake(() => nowMs++); // t0 = 0,1,...,8
  for (let i = 0; i < 9; i++) sh.push(0.45);
  // 9 pushes into a ring of 8 -> the oldest (t0=0) is evicted; survivors are
  // t0 = 1..8. Query at nowMs = 9 so every surviving age (1..8 ms) is positive.
  let expected = 0;
  for (let t0 = 1; t0 <= 8; t0++) {
    expected += 0.45 * Math.exp((-6 * (9 - t0)) / 1000);
  }
  const o = sh.offset(9);
  const total = Math.min(expected, 0.5);
  approx(Math.hypot(o.x, o.z), total, 1e-6, 'sum of the 8 surviving, clamped');
  assert.ok(Number.isFinite(o.x) && Number.isFinite(o.y) && Number.isFinite(o.z));
});

// ===========================================================================
// CameraRig — composition path (headless three)
// ===========================================================================
test('CameraRig.update writes playing pose + lookTarget, allocating nothing new', () => {
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  const rig = new CameraRig(() => 0);
  rig.attach(camera);

  rig.update(16, { state: 'playing', deathCell: null, won: false }, 0, 0, 0);

  // pose at t=0 with no shake => exact (0,13,17.5); lookTarget (0,0,0).
  approxVec(camera.position, { x: 0, y: 13, z: 17.5 }, 1e-6);
  assert.ok(rig.lookTarget instanceof THREE.Vector3, 'lookTarget is a Vector3');
  approxVec(
    rig.lookTarget,
    { x: 0, y: 0, z: 0 },
    1e-6
  );

  // repeated updates must reuse the SAME lookTarget singleton (no re-creation)
  const first = rig.lookTarget;
  rig.update(16, { state: 'playing', deathCell: null, won: false }, 1, 0, 0);
  assert.equal(rig.lookTarget, first, 'lookTarget reused across updates');
});

test('CameraRig.onDeath applies the death shake to the composed pose', () => {
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  const rig = new CameraRig(() => 0);
  rig.attach(camera);

  rig.update(16, { state: 'playing', deathCell: null, won: false }, 0, 0, 0);
  const clean = { x: camera.position.x, y: camera.position.y, z: camera.position.z };

  rig.onDeath(0); // t0 = 0
  rig.update(16, { state: 'playing', deathCell: null, won: false }, 0, 0, 0);
  const d =
    Math.abs(camera.position.x - clean.x) +
    Math.abs(camera.position.y - clean.y) +
    Math.abs(camera.position.z - clean.z);
  assert.ok(d > 0, `shake perturbed the pose (|d|=${d})`);
  // and the applied shake magnitude matches DEATH_AMP (0.45) horizontally
  const ang = shakeAngle(0);
  approx(camera.position.x, clean.x + DEATH_AMP * Math.cos(ang), 1e-6, 'x after death shake');
  approx(camera.position.z, clean.z + DEATH_AMP * Math.sin(ang), 1e-6, 'z after death shake');
});
