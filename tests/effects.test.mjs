// T09 (water + dust) — Node-runnable tests. Pure math is driven directly and
// three-dependent objects are instantiated (three is Node-safe). All checks
// use the public position buffers only (no private introspection).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import {
  waterCenterWorld,
  waterRadiusWorld,
  foamRingSegments,
  shimmerOffset,
  WaterVisual,
  buildWater
} from '../js/world/water.js';
import {
  DustSystem,
  BurstSystem,
  DUST_BOX_X,
  DUST_Y_MIN,
  DUST_Y_MAX,
  BURST_Y0,
  BURST_POOL
} from '../js/world/dust.js';

const EPS6 = 1e-6;
function near(a, b, eps = EPS6) {
  return Math.abs(a - b) <= eps;
}

// --- 1. Water pure oracles ---------------------------------------------------
test('water center/radius/foam/shimmer pure oracles', () => {
  const c = waterCenterWorld();
  assert.ok(near(c.x, 4.5), `center.x=${c.x}`);
  assert.ok(near(c.z, 4.5), `center.z=${c.z}`);
  assert.equal(waterRadiusWorld(), 3.0);

  const seg = foamRingSegments(8);
  assert.equal(seg.length, 8);
  // index 0 → angle 0 → (center.x + 3.15, center.z)
  assert.ok(near(seg[0].x, 4.5 + 3.15), `seg0.x=${seg[0].x}`);
  assert.ok(near(seg[0].z, 4.5), `seg0.z=${seg[0].z}`);
  // index 2 → angle 90° → (center.x, center.z + 3.15)
  assert.ok(near(seg[2].x, 4.5), `seg[2].x=${seg[2].x}`);
  assert.ok(near(seg[2].z, 4.5 + 3.15), `seg[2].z=${seg[2].z}`);

  assert.equal(shimmerOffset(0, 0, 64), 0); // exactly 0
  assert.ok(
    near(shimmerOffset(0.5, 1, 64), 0.03 * Math.sin(2 * Math.PI * 0.25 + 2.4), 1e-6)
  );
});

// --- 2. WaterVisual construction --------------------------------------------
test('WaterVisual = transparent disc + 64-seg foam LineLoop, allocation-free update', () => {
  const scene = new THREE.Scene();
  const water = new WaterVisual().attach(scene);
  assert.equal(water.group.name, 'water');
  assert.ok(scene.children.includes(water.group));

  const disc = water.water;
  assert.ok(disc.geometry instanceof THREE.CircleGeometry, 'disc uses CircleGeometry');
  assert.equal(disc.material.transparent, true);
  assert.ok(near(disc.material.opacity, 0.55));

  const foam = water.foam;
  assert.ok(foam instanceof THREE.LineLoop);
  assert.equal(foam.geometry.attributes.position.array.length, 64 * 3);

  // update() animates x/z in place, leaves y at FOAM_Y, reuses the buffer.
  const arr = foam.geometry.attributes.position.array;
  const before = arr.slice(0);
  water.update(0.37);
  assert.equal(foam.geometry.attributes.position.array, arr, 'same buffer (no realloc)');
  let moved = false;
  for (let i = 0; i < 64; i++) {
    assert.ok(near(arr[i * 3 + 1], before[i * 3 + 1]), 'foam height unchanged');
    if (Math.abs(arr[i * 3] - before[i * 3]) > 1e-9) moved = true;
  }
  assert.ok(moved, 'shimmer moved at least one foam x/z');
});

test('buildWater(scene) returns an attached WaterVisual', () => {
  const scene = new THREE.Scene();
  const w = buildWater(scene);
  assert.ok(w instanceof WaterVisual);
  assert.ok(scene.children.includes(w.group));
});

// --- 3. DustSystem determinism + stable buffer ------------------------------
test('DustSystem count=80 seed=7 is deterministic and keeps buffer length', () => {
  const s1 = new THREE.Scene();
  const s2 = new THREE.Scene();
  const d1 = new DustSystem().attach(s1, 80, 7);
  const d2 = new DustSystem().attach(s2, 80, 7);
  const p1 = d1.geometry.attributes.position.array;
  const p2 = d2.geometry.attributes.position.array;
  assert.equal(p1.length, 240);
  for (let i = 0; i < p1.length; i++) {
    assert.ok(near(p1[i], p2[i], 1e-9), `initial pos ${i} differs`);
  }

  const d1arr = d1.geometry.attributes.position.array;
  const lenBefore = d1arr.length;
  d1.updateDust(1.0);
  assert.equal(d1.geometry.attributes.position.array.length, lenBefore);
  for (let i = 0; i < 80; i++) {
    const x = p1[i * 3];
    const y = p1[i * 3 + 1];
    const z = p1[i * 3 + 2];
    assert.ok(x >= -DUST_BOX_X - 1e-9 && x <= DUST_BOX_X + 1e-9, `x out of box: ${x}`);
    assert.ok(y >= DUST_Y_MIN - 1e-9 && y <= DUST_Y_MAX + 1e-9, `y out of box: ${y}`);
    assert.ok(z >= -DUST_BOX_X - 1e-9 && z <= DUST_BOX_X + 1e-9, `z out of box: ${z}`);
  }
});

// --- 4. DustSystem wrap ------------------------------------------------------
test('DustSystem wraps a falling particle from y≈0.3 back to y=9', () => {
  const scene = new THREE.Scene();
  const d = new DustSystem().attach(scene, 1, 123);
  const p = d.geometry.attributes.position.array;
  p[0] = 0;
  p[1] = 0.3; // y
  p[2] = 0;
  d.velocities[0] = 0; // vx
  d.velocities[1] = -0.1; // vy
  d.velocities[2] = 0; // vz
  // Integrate 10s in small steps (sums to 10). y starts 0.3 and falls; when it
  // drops below 0.2 it must wrap to 9. Detect the wrap from the public buffer.
  let wrapped = false;
  for (let k = 0; k < 100; k++) {
    d.updateDust(0.1);
    if (near(p[1], DUST_Y_MAX, 1e-6)) wrapped = true;
  }
  assert.ok(wrapped, `particle never wrapped to y=9 (final y=${p[1]})`);
  assert.ok(p[1] >= DUST_Y_MIN - 1e-9 && p[1] <= DUST_Y_MAX + 1e-9);
});

// --- 5. BurstSystem lifecycle ------------------------------------------------
test('BurstSystem emitBurst(10,8): 48 slots at cell center, expire after 0.61s, re-arm', () => {
  const scene = new THREE.Scene();
  const b = new BurstSystem().attach(scene);
  assert.equal(b.poolSize, BURST_POOL);
  assert.ok(!b.points.visible, 'starts hidden');

  b.emitBurst(10, 8);
  const p = b.geometry.attributes.position.array;
  for (let i = 0; i < BURST_POOL; i++) {
    assert.ok(near(p[i * 3], 0.5, 1e-6), `slot ${i} x != 0.5`);
    assert.ok(near(p[i * 3 + 1], BURST_Y0, 1e-6), `slot ${i} y != ${BURST_Y0}`);
    assert.ok(near(p[i * 3 + 2], -1.5, 1e-6), `slot ${i} z != -1.5`);
  }
  assert.ok(b.points.visible, 'visible right after emit');

  b.updateBurst(0.61);
  let anyAlive = false;
  for (let i = 0; i < BURST_POOL; i++) if (b.life[i] > 0) anyAlive = true;
  assert.equal(anyAlive, false, 'all slots inactive after 0.61s');
  assert.equal(b.points.visible, false, 'points hidden once all expired');

  // Re-emit arms it again.
  b.emitBurst(2, 3);
  assert.ok(b.points.visible, 're-emit re-arms the system');
});

// --- 6. No per-frame allocation ---------------------------------------------
test('DustSystem.updateDust reuses the same attribute/buffer across frames', () => {
  const scene = new THREE.Scene();
  const d = new DustSystem().attach(scene, 40, 9);
  const attr = d.geometry.attributes.position;
  const len = attr.array.length;
  for (let k = 0; k < 5; k++) d.updateDust(0.016);
  assert.equal(d.geometry.attributes.position, attr, 'no new attribute constructed');
  assert.equal(attr.array.length, len, 'buffer never grows');
});
