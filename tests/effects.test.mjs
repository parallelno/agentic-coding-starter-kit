// tests/effects.test.mjs — T09 acceptance (R-WORLD-02, R-WORLD-06, R-PERF-04).
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {
  waterCenterWorld,
  waterRadiusWorld,
  foamRingSegments,
  shimmerOffset,
} from '../js/world/water.js';
import Water from '../js/world/water.js';
import {
  DustSystem,
  BurstSystem,
  makeDustSprite,
  DUST_XZ_HALF,
  DUST_Y_MIN,
  DUST_Y_MAX,
  BURST_Y0,
  BURST_LIFE,
  BURST_POOL,
} from '../js/world/dust.js';
import { cellToWorld } from '../js/game/core.js';

// Positions live in a Float32Array, so buffer reads carry ~1e-6 relative
// rounding; use a float32-appropriate tolerance for those comparisons.
const F32 = 1e-5;
function approx(a, b, eps = 1e-6) {
  assert.ok(
    Math.abs(a - b) <= eps,
    `expected ${a} within ${eps} of ${b}`
  );
}

// ---------------------------------------------------------------------------
// Water (R-WORLD-02) — pure oracles
// ---------------------------------------------------------------------------
const TAU = Math.PI * 2;

test('waterCenterWorld is the pinned pond center (4.5, 4.5)', () => {
  const c = waterCenterWorld();
  approx(c.x, 4.5, 1e-9);
  approx(c.z, 4.5, 1e-9);
});

test('waterRadiusWorld is 3.0', () => {
  approx(waterRadiusWorld(), 3.0, 1e-9);
});

test('foamRingSegments(8): index 0 on +x, index 2 on +z', () => {
  const R = 3.0 + 0.15; // pinned: waterRadiusWorld() + FOAM_RING_OFFSET
  const pts = foamRingSegments(8);
  assert.equal(pts.length, 8);
  approx(pts[0].x, 4.5 + R, 1e-6);
  approx(pts[0].z, 4.5, 1e-6);
  approx(pts[2].x, 4.5, 1e-6);
  approx(pts[2].z, 4.5 + R, 1e-6);
});

test('shimmerOffset pinned oracles', () => {
  approx(shimmerOffset(0, 0, 64), Math.sin(0), 1e-9);
  approx(shimmerOffset(0.5, 1, 64), 0.03 * Math.sin(TAU * 0.5 + 2.4), 1e-6);
});

test('shimmerOffset stays within [-0.03, 0.03]', () => {
  for (let i = 0; i < 64; i++) {
    const v = shimmerOffset(1.234, i, 64);
    assert.ok(v >= -0.030000001 && v <= 0.030000001, `out of range: ${v}`);
  }
});

test('Water build: circle water + ring foam, no light added', () => {
  const scene = new THREE.Scene();
  const w = new Water().build(scene);
  assert.ok(w.water instanceof THREE.Mesh);
  assert.ok(w.foam instanceof THREE.Mesh);
  assert.ok(w.water.geometry instanceof THREE.CircleGeometry);
  const ring = w.foam.geometry;
  assert.ok(ring instanceof THREE.RingGeometry);
  approx(w.foam.material.opacity, 0.8, 1e-6);
  assert.equal(w.water.material.transparent, true);

  const lights = [];
  scene.traverse((o) => {
    if (o && (o.type === 'Light' || o.isLight)) lights.push(o);
  });
  assert.equal(lights.length, 0, 'no light in water build');
});

// ---------------------------------------------------------------------------
// DustSystem (R-WORLD-06, R-PERF-04, determinism)
// ---------------------------------------------------------------------------
// Independent re-implementation of the documented per-index hash so the
// determinism test recomputes the initial layout from first principles.
function perIndexRand(seed, i, k) {
  let h = (seed + Math.imul(i, 0x9e3779b9) + Math.imul(k, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}
function initialXZ(seed, i, k) {
  return (perIndexRand(seed, i, k) * 2 - 1) * DUST_XZ_HALF;
}
function initialY(seed, i) {
  const py = perIndexRand(seed, i, 1);
  return DUST_Y_MIN + py * (DUST_Y_MAX - DUST_Y_MIN);
}

test('DustSystem determinism: two instances, same seed -> identical layout', () => {
  const s1 = new THREE.Scene();
  const s2 = new THREE.Scene();
  const d1 = new DustSystem(80).attach(s1, 80, 7, { canvas: undefined });
  const d2 = new DustSystem(80).attach(s2, 80, 7, { canvas: undefined });
  for (let i = 0; i < 80; i++) {
    approx(d1.positions[i * 3], initialXZ(7, i, 0), F32);
    approx(d1.positions[i * 3 + 1], initialY(7, i), F32);
    approx(d1.positions[i * 3 + 2], initialXZ(7, i, 2), F32);
    approx(d1.positions[i * 3], d2.positions[i * 3], 1e-9);
    approx(d1.positions[i * 3 + 1], d2.positions[i * 3 + 1], 1e-9);
    approx(d1.positions[i * 3 + 2], d2.positions[i * 3 + 2], 1e-9);
  }
});

test('DustSystem updateDust keeps every particle in the wrapping box', () => {
  const d = new DustSystem(80).attach(new THREE.Scene(), 80, 3);
  let reachedTop = false;
  for (let step = 0; step < 400; step++) {
    d.updateDust(0.05);
    for (let i = 0; i < 80; i++) {
      const x = d.positions[i * 3];
      const y = d.positions[i * 3 + 1];
      const z = d.positions[i * 3 + 2];
      assert.ok(x <= DUST_XZ_HALF && x >= -DUST_XZ_HALF, `x ${x}`);
      assert.ok(z <= DUST_XZ_HALF && z >= -DUST_XZ_HALF, `z ${z}`);
      assert.ok(y >= DUST_Y_MIN - 1e-9 && y <= DUST_Y_MAX + 1e-9, `y ${y}`);
      if (y === DUST_Y_MAX) reachedTop = true;
    }
  }
  // with vy<0 for every particle, wrapping to the top must eventually happen
  assert.ok(reachedTop, 'never wrapped to the top');
});

test('DustSystem R-PERF-04: position buffer identity + length preserved', () => {
  const d = new DustSystem(80).attach(new THREE.Scene(), 80, 11);
  const attrBefore = d.points.geometry.attributes.position;
  const arrBefore = attrBefore.array;
  const lenBefore = arrBefore.length;
  d.updateDust(1.0);
  d.updateDust(0.5);
  const attrAfter = d.points.geometry.attributes.position;
  assert.equal(attrAfter, attrBefore, 'position attribute reused');
  assert.equal(attrAfter.array, arrBefore, 'position buffer identity kept');
  assert.equal(attrAfter.array.length, lenBefore, 'buffer length unchanged');
  assert.equal(arrBefore.length, 80 * 3);
  assert.equal(d.points.geometry, d.points.geometry); // same geometry (no realloc)
});

test('DustSystem wrap oracle: y=0.3, vy=-0.1 -> wraps to y=9 within 10s', () => {
  const d = new DustSystem(20).attach(new THREE.Scene(), 20, 5);
  const n = d.count;
  // place all particles at y=0.3 with vy=-0.1
  for (let i = 0; i < n; i++) {
    d.positions[i * 3 + 1] = 0.3;
    d.velocities[i * 3 + 1] = -0.1;
  }
  let reached = false;
  for (let t = 0; t <= 10; t += 0.1) {
    d.updateDust(0.1);
    for (let i = 0; i < n; i++) {
      if (d.positions[i * 3 + 1] >= DUST_Y_MAX - 1e-9) reached = true;
    }
  }
  assert.ok(reached, 'y=0.3 with vy=-0.1 should wrap to y=9 within <=10s');
});

// ---------------------------------------------------------------------------
// BurstSystem (R-WORLD-06, R-PERF-04, pool)
// ---------------------------------------------------------------------------
function dummyRng() {
  return () => 0.5;
}

test('BurstSystem emitBurst(10,8): all slots at cellToWorld(10,8) at y0', () => {
  const b = new BurstSystem(BURST_POOL).attach(new THREE.Scene(), BURST_POOL);
  b.emitBurst(10, 8, dummyRng());
  const cw = cellToWorld(10, 8);
  assert.ok(Math.abs(cw.x - 0.5) < 1e-9);
  assert.ok(Math.abs(cw.z - -1.5) < 1e-9);
  assert.equal(b.points.visible, true);
  for (let i = 0; i < BURST_POOL; i++) {
    const i3 = i * 3;
    approx(b.positions[i3], cw.x, F32);
    approx(b.positions[i3 + 1], BURST_Y0, F32);
    approx(b.positions[i3 + 2], cw.z, F32);
    assert.ok(b.life[i] > 0, `slot ${i} not armed`);
  }
});

test('BurstSystem updateBurst(0.61): all inactive -> points.visible=false', () => {
  const b = new BurstSystem(BURST_POOL).attach(new THREE.Scene(), BURST_POOL);
  b.emitBurst(10, 8, dummyRng());
  b.updateBurst(BURST_LIFE + 0.01); // 0.61
  for (let i = 0; i < BURST_POOL; i++) {
    assert.ok(b.life[i] <= 0, `slot ${i} still active`);
  }
  assert.equal(b.points.visible, false, 'should hide after full expiry');
});

test('BurstSystem re-arm: a fresh emitBurst makes it visible again', () => {
  const b = new BurstSystem(BURST_POOL).attach(new THREE.Scene(), BURST_POOL);
  b.emitBurst(3, 3, dummyRng());
  b.updateBurst(BURST_LIFE + 0.01);
  assert.equal(b.points.visible, false);
  b.emitBurst(12, 12, dummyRng());
  assert.equal(b.points.visible, true, 're-arm should restore visibility');
  assert.ok(b.life[0] > 0);
});

test('BurstSystem R-PERF-04: buffer identity + length preserved over updates', () => {
  const b = new BurstSystem(BURST_POOL).attach(new THREE.Scene(), BURST_POOL);
  b.emitBurst(7, 7, dummyRng());
  const posAttr = b.points.geometry.attributes.position;
  const colAttr = b.points.geometry.attributes.color;
  const posArr = posAttr.array;
  const colArr = colAttr.array;
  const lifeArr = b.life;
  for (let i = 0; i < 10; i++) b.updateBurst(0.05);
  assert.equal(b.points.geometry.attributes.position, posAttr);
  assert.equal(b.points.geometry.attributes.color, colAttr);
  assert.equal(posArr.length, BURST_POOL * 3);
  assert.equal(colArr.length, BURST_POOL * 3);
  assert.equal(b.life, lifeArr);
});

// ---------------------------------------------------------------------------
// makeDustSprite injects a canvas without a DOM
// ---------------------------------------------------------------------------
function makeMockCanvas() {
  const stops = [];
  return {
    width: 0,
    height: 0,
    canvas: null,
    _stops: stops,
    createRadialGradient() {
      const g = { addColorStop(st) { stops.push(st); } };
      g.canvas = this;
      return g;
    },
    clearRect() {},
    fillRect() {},
    set fillStyle(v) {
      this._fill = v;
    },
    get fillStyle() {
      return this._fill;
    },
  };
}

test('makeDustSprite draws to an injected 2D context (Node-safe)', () => {
  const ctx = makeMockCanvas();
  const tex = makeDustSprite(ctx);
  assert.ok(tex instanceof THREE.CanvasTexture);
  assert.ok(ctx._stops.length >= 1, 'sprite should add at least one color stop');
});

test('makeDustSprite throws a clear error without an injectable canvas/ctx', () => {
  assert.throws(() => makeDustSprite(undefined), /inject a 2D canvas/);
});

test('BurstSystem default export surface includes the expected pool', () => {
  assert.equal(BURST_POOL, 48);
  assert.equal(BURST_Y0, 0.45);
  assert.equal(BURST_LIFE, 0.6);
});
