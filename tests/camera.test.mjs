// T10 (camera) — Node-runnable tests. Pure cameraPose + Shake are driven
// directly; the CameraRig composition is exercised through a THREE camera.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { cellToWorld } from '../js/game/core.js';

import {
  cameraPose,
  smoothstep,
  Shake,
  CameraRig,
  T_DOLLY
} from '../js/world/camera.js';

const near = (a, b, eps = 1e-4) => Math.abs(a - b) <= eps;
const dist3 = (p, q) =>
  Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);

// --- menu orbit --------------------------------------------------------------
test('menu pose: t=0 angle 0 (radius 20, height 12); t=30 angle π', () => {
  const p0 = cameraPose({ state: 'menu', t: 0 });
  assert.ok(near(p0.position.x, 20, 1e-9), `t0 x=${p0.position.x}`);
  assert.ok(near(p0.position.y, 12, 1e-9));
  assert.ok(near(p0.position.z, 0, 1e-9), `t0 z=${p0.position.z}`);
  assert.ok(dist3(p0.position, { x: 0, y: 0, z: 0 }) > 20); // orbit ring radius 20

  const p30 = cameraPose({ state: 'menu', t: 30 });
  assert.ok(near(p30.position.x, -20, 1e-6), `t30 x=${p30.position.x}`);
  assert.ok(near(p30.position.z, 0, 1e-6), `t30 z=${p30.position.z}`);
  assert.ok(near(p30.position.y, 12, 1e-9));
  // target always center
  assert.ok(near(p0.target.x, 0) && near(p0.target.y, 0) && near(p0.target.z, 0));
});

// --- playing Lissajous -------------------------------------------------------
test('playing pose: t=0 -> (0,13,17.5); t=10 -> Lissajous offsets', () => {
  const p0 = cameraPose({ state: 'playing', t: 0 });
  assert.ok(near(p0.position.x, 0, 1e-9));
  assert.ok(near(p0.position.y, 13, 1e-9));
  assert.ok(near(p0.position.z, 17.5, 1e-9));

  const p10 = cameraPose({ state: 'playing', t: 10 });
  assert.ok(near(p10.position.x, 0.15 * Math.sin(0.11 * 10)), `x=${p10.position.x}`);
  assert.ok(near(p10.position.z, 17.5 + 0.15 * Math.sin(0.07 * 10)));
  assert.ok(near(p10.position.y, 13, 1e-9));

  const pp = cameraPose({ state: 'paused', t: 10 });
  assert.ok(near(pp.position.x, p10.position.x, 1e-9), 'paused == playing framing');
});

// --- death dolly -------------------------------------------------------------
test('dead (not won) dolly: t0=playing, T_DOLLY/2 smoothstep .5 midway, T_DOLLY+5 end', () => {
  const deathCell = { c: 5, r: 3 };
  const w = cellToWorld(deathCell.c, deathCell.r); // (x: -4.5, z: -6.5)

  // tSinceDeath=0 -> playing pose at tDeath (t=0 -> tDeath=0)
  const at0 = cameraPose({ state: 'dead', t: 0, deathCell, tSinceDeath: 0 });
  assert.ok(near(at0.position.x, 0, 1e-9));
  assert.ok(near(at0.position.y, 13, 1e-9));
  assert.ok(near(at0.position.z, 17.5, 1e-9));

  // End pose = (w.x, 3, w.z + sqrt(8^2-3^2)). Compute it independently.
  const hz = Math.sqrt(8 * 8 - 3 * 3);
  const end = { x: w.x, y: 3, z: w.z + hz };

  // tSinceDeath = T_DOLLY/2, with t = tDeath + T_DOLLY/2, tDeath = 0
  const mid = cameraPose({ state: 'dead', t: T_DOLLY / 2, deathCell, tSinceDeath: T_DOLLY / 2 });
  // smoothstep(0.5) = 0.5 -> position = start*0.5 + end*0.5
  const expectedMid = {
    x: (0 + end.x) / 2,
    y: (13 + end.y) / 2,
    z: (17.5 + end.z) / 2
  };
  assert.ok(near(mid.position.x, expectedMid.x, 1e-3), `mid.x=${mid.position.x} e=${expectedMid.x}`);
  assert.ok(near(mid.position.y, expectedMid.y, 1e-3));
  assert.ok(near(mid.position.z, expectedMid.z, 1e-3));

  // tSinceDeath = T_DOLLY + 5 -> exact low-3/4 pose (dolly complete + held)
  const late = cameraPose({ state: 'dead', t: T_DOLLY + 5, deathCell, tSinceDeath: T_DOLLY + 5 });
  assert.ok(near(late.position.x, end.x, 1e-9), `late.x=${late.position.x} e=${end.x}`);
  assert.ok(near(late.position.y, end.y, 1e-9));
  assert.ok(near(late.position.z, end.z, 1e-9));
  // 3D distance from death cell = 8, height 3 above it
  assert.ok(near(dist3(late.position, { x: w.x, y: 0, z: w.z }), 8, 1e-9), 'dolly end at distance 8');
  // target = death cell world position
  assert.ok(near(late.target.x, w.x, 1e-9) && near(late.target.z, w.z, 1e-9));
});

test('dead (won) -> playing pose (no dolly)', () => {
  const p = cameraPose({ state: 'dead', t: 3, deathCell: { c: 0, r: 0 }, tSinceDeath: 9, won: true });
  const q = cameraPose({ state: 'playing', t: 3 });
  assert.ok(near(p.position.x, q.position.x, 1e-9));
  assert.ok(near(p.position.y, q.position.y, 1e-9));
  assert.ok(near(p.position.z, q.position.z, 1e-9));
});

// --- Shake decay + overlap clamp + drop + determinism ------------------------
test('Shake: single-push decay; overlapping impulses sum and clamp at 0.5', () => {
  const s = new Shake(() => 0);
  s.push(0.45, 0);
  const t0 = s.offset(0);
  assert.ok(near(Math.hypot(t0.x, t0.z), 0.45, 1e-6), `|t0|=${Math.hypot(t0.x, t0.z)}`);

  const t100 = s.offset(100);
  const expected = 0.45 * Math.exp(-6 * 0.1);
  assert.ok(near(Math.hypot(t100.x, t100.z), expected, 1e-3), `|100ms|=${Math.hypot(t100.x, t100.z)} e=${expected}`);
  assert.ok(near(t100.y, expected * 0.3, 1e-3), 'y = total*0.3');

  // Impulse dropped after 1.2s
  const s2 = new Shake(() => 0);
  s2.push(0.45, 0);
  const dropped = s2.offset(1201);
  assert.equal(Math.hypot(dropped.x, dropped.z), 0);

  // Two overlapping pushes sum, magnitude capped at 0.5
  const s3 = new Shake(() => 0);
  s3.push(0.45, 0);
  s3.push(0.45, 1);
  const cap = s3.offset(0);
  assert.ok(Math.hypot(cap.x, cap.z) <= 0.5 + 1e-9, `capped=${Math.hypot(cap.x, cap.z)}`);
});

test('Shake determinism: same now sequence -> identical offsets; push without t0 uses now()', () => {
  // Identical push/offset script -> identical offset vector.
  const run = () => {
    const clock = { t: 1000 };
    const sys = new Shake(() => clock.t);
    const offs = [];
    for (const step of [0, 40, 17, 55]) {
      sys.push(0.45); // t0 = now() = clock.t
      offs.push(sys.offset(clock.t).x, sys.offset(clock.t).z);
      clock.t += step;
    }
    return offs;
  };
  assert.deepEqual(run(), run());

  // push() with no explicit t0 uses the injected now().
  let now = 1234;
  const s = new Shake(() => now);
  s.push(0.45);
  const o = s.offset(now);
  assert.ok(near(Math.hypot(o.x, o.z), 0.45, 1e-6), 'push used injected now as t0');
});

// --- CameraRig composition ----------------------------------------------------
test('CameraRig.update writes camera.position + lookTarget without per-frame alloc', () => {
  const cam = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
  let now = 0;
  const rig = new CameraRig(() => now);
  const beforeTarget = rig.lookTarget;
  rig.attach(cam);

  const snap = { state: 'menu', deathCell: null, won: false };
  for (let i = 0; i < 1000; i++) {
    rig.update(16, snap, i * 0.016, 0, now);
  }
  assert.equal(rig.lookTarget, beforeTarget, 'lookTarget reused (preallocated)');
  assert.ok(cam.position.x !== 0 || cam.position.y !== 13, 'camera moved on orbit');

  // eat / death impulses feed the shake
  const s0 = rig.shake.offset(0);
  rig.onEat(0);
  const sEat = rig.shake.offset(0);
  assert.ok(Math.hypot(sEat.x, sEat.z) > s0 || Math.hypot(sEat.x) !== 0, 'eat pushed a shake');
});
