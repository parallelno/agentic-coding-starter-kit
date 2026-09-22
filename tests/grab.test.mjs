// Task 04 acceptance tests: pure grab helpers (no DOM, no three.js rendering).
import test from 'node:test';
import assert from 'node:assert/strict';

import { targetOnPlane, pickVertex } from '../js/interact/grab.js';
import { ClothSim } from '../js/core/cloth.js';
import { COLS, DT_SUB } from '../js/config.js';

test('targetOnPlane intersects known rays and rejects parallel/behind rays', () => {
  // Straight down from (1, 2, 3) to y = 0.
  assert.deepEqual(targetOnPlane({ x: 1, y: 2, z: 3 }, { x: 0, y: -1, z: 0 }, 0), { x: 1, y: 0, z: 3 });

  // Diagonal ray: origin (0,1,0), dir (1,-1,0) normalised-ish -> hits y=0 at t=1.
  const diag = targetOnPlane({ x: 0, y: 1, z: 0 }, { x: 1, y: -1, z: 0 }, 0);
  assert.ok(Math.abs(diag.x - 1) < 1e-9 && Math.abs(diag.z - 0) < 1e-9 && diag.y === 0, JSON.stringify(diag));

  // Parallel to the plane -> null.
  assert.equal(targetOnPlane({ x: 0, y: 1, z: 0 }, { x: 1, y: 0, z: 0 }, 0), null);
  // Plane behind the ray origin -> null.
  assert.equal(targetOnPlane({ x: 0, y: 1, z: 0 }, { x: 0, y: 1, z: 0 }, 0), null);
  // Non-zero plane height.
  const high = targetOnPlane({ x: 0, y: 3, z: 0 }, { x: 0, y: -2, z: 0 }, 2);
  assert.deepEqual(high, { x: 0, y: 2, z: 0 });
});

test('pickVertex returns the closest corner of the hit triangle only', () => {
  const positions = new Float32Array(6 * 3);
  positions.set([0, 0, 0, 1, 0, 0, 0, 1, 0, 9, 9, 9, -9, -9, -9, 5, 5, 5]);
  const face = [0, 1, 2];

  assert.equal(pickVertex(face, { x: 0.05, y: 0.05, z: 0 }, positions), 0);
  assert.equal(pickVertex(face, { x: 0.95, y: 0.02, z: 0 }, positions), 1);
  assert.equal(pickVertex(face, { x: 0.05, y: 0.93, z: 0.02 }, positions), 2);

  // A hit point near a different (non-face) vertex still returns a face corner.
  assert.equal(pickVertex(face, { x: 8.8, y: 8.8, z: 8.8 }, positions), 1);

  // Face vertex indices are respected for any triangle.
  assert.equal(pickVertex([3, 4, 5], { x: 4.9, y: 5.1, z: 5 }, positions), 5);
});

test('grab temp pin drives a vertex and leaves no residue on release', () => {
  const sim = new ClothSim();
  for (let i = 0; i < 240; i++) sim.step(DT_SUB);

  const grabIndex = 12 * COLS + 16;
  const start = [sim.positions[grabIndex * 3], sim.positions[grabIndex * 3 + 1], sim.positions[grabIndex * 3 + 2]];
  const target = [start[0] + 0.4, start[1] - 0.5, start[2] + 0.3];

  // Drag like a pointer does: the pin target moves a little each substep. While pinned, the
  // velocity stored by the sim stays exactly zero (prev == position), which is what prevents a
  // rocket-jet the moment the pin is released.
  const steps = 120;
  let maxHeldVelocity = 0;
  for (let s = 1; s <= steps; s++) {
    const f = s / steps;
    sim.setTempPin(grabIndex, start[0] + (target[0] - start[0]) * f, start[1] + (target[1] - start[1]) * f, start[2] + (target[2] - start[2]) * f);
    sim.step(DT_SUB);
    const p = grabIndex * 3;
    maxHeldVelocity = Math.max(
      maxHeldVelocity,
      Math.hypot(sim.positions[p] - sim.prev[p], sim.positions[p + 1] - sim.prev[p + 1], sim.positions[p + 2] - sim.prev[p + 2]),
    );
  }
  const held = [sim.positions[grabIndex * 3], sim.positions[grabIndex * 3 + 1], sim.positions[grabIndex * 3 + 2]];
  assert.ok(Math.hypot(held[0] - target[0], held[1] - target[1], held[2] - target[2]) < 1e-6, 'held vertex sits exactly at the temp-pin target');
  assert.ok(held[1] < start[1] - 0.45, `vertex followed the drag downward (held y=${held[1].toFixed(3)}, start y=${start[1].toFixed(3)})`);
  assert.equal(maxHeldVelocity, 0, 'held vertex never accumulates velocity (prev == position while pinned)');

  // Release: zero stored velocity, and the vertex only moves under elasticity (bounded).
  sim.clearTempPin();
  sim.step(DT_SUB);
  const o = grabIndex * 3;
  const movedAfterRelease = Math.hypot(sim.positions[o] - held[0], sim.positions[o + 1] - held[1], sim.positions[o + 2] - held[2]);
  assert.ok(movedAfterRelease < 0.5, `release causes elastic snap-back only (moved ${movedAfterRelease.toFixed(3)} m in one substep)`);

  for (let i = 0; i < 240; i++) sim.step(DT_SUB);
  let maxAbs = 0;
  for (let i = 0; i < sim.vertCount; i++) {
    const q = i * 3;
    assert.ok(Number.isFinite(sim.positions[q + 1]), 'no NaN after release');
    maxAbs = Math.max(maxAbs, Math.abs(sim.positions[q]), Math.abs(sim.positions[q + 1]), Math.abs(sim.positions[q + 2]));
  }
  assert.ok(maxAbs < 50, `no explosion after a drag (max |p| = ${maxAbs.toFixed(2)})`);

  // The sheet recovers (no permanent warping from stretch alone): the vertex drifts back up
  // toward its row rather than staying pinned where it was dropped.
  const settledY = sim.positions[grabIndex * 3 + 1];
  assert.ok(settledY > held[1] + 0.2, `sheet recovers after release (dropped at ${held[1].toFixed(3)}, settled at ${settledY.toFixed(3)})`);
});
