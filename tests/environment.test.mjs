// tests/environment.test.mjs — T06 gate (R-WORLD-01, R-WORLD-03, R-ARCH-06).
// Pure math is asserted exactly (oracle recomputed independently per the
// formula documented in materials.js). Construction smoke uses headless
// three (no WebGL context needed).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  hash2,
  valueNoise,
  sandAlbedo,
  wallColor,
  FLOOR_SIZE,
} from '../js/world/materials.js';
import {
  SKY_TOP,
  SKY_HORIZON,
  makeEnvTexture,
  bakeScene,
  lights,
} from '../js/world/environment.js';
import { floorTexturePixels, TEXTURE_SIZE } from '../js/world/floor.js';
import { buildWalls } from '../js/world/walls.js';

const THREE = await import('three').then((m) => m).catch(() => null);

// --- independent reference oracle (mirrors the documented formula) ---------

const SALT = 0x9e3779b9;

// h = ((c * 374761393 + r * 668265263) ^ SALT) * 2654435761 (uint32) / 2^32
function refHash2(c, r) {
  const ic = c | 0;
  const ir = r | 0;
  let h = (ic * 374761393 + ir * 668265263) ^ SALT;
  h = Math.imul(h, 2654435761);
  return (h >>> 0) / 4294967296;
}

// Bilinear value noise over hashes with smoothstep weights, at `scale`.
function refValueNoise(x, y, scale) {
  const sx = x * scale;
  const sy = y * scale;
  const ix = Math.floor(sx);
  const iy = Math.floor(sy);
  const fx = sx - ix;
  const fy = sy - iy;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const a = refHash2(ix, iy);
  const b = refHash2(ix + 1, iy);
  const c = refHash2(ix, iy + 1);
  const d = refHash2(ix + 1, iy + 1);
  return (a + (b - a) * u) + ((c + (d - c) * u) - (a + (b - a) * u)) * v;
}

const SCALE = 8; // documented NOISE_SCALE of sandAlbedo
const BASE = { r: 201 / 255, g: 181 / 255, b: 140 / 255 }; // #c9b58c

function refSand(c, r, line) {
  const f = 0.88 + 0.24 * refValueNoise(c, r, SCALE); // ±12%
  const g = line ? 0.94 : 1;
  return { r: BASE.r * f * g, g: BASE.g * f * g, b: BASE.b * f * g };
}

const approx = (a, b, eps) => assert.ok(
  Math.abs(a - b) <= eps,
  `expected ${a} to be within ${eps} of ${b}`,
);

// --- materials.js ----------------------------------------------------------

test('valueNoise oracle: exact equality at (0.5, 0.5, 4) and non-degenerate points', () => {
  assert.equal(valueNoise(0.5, 0.5, 4), refValueNoise(0.5, 0.5, 4));
  // Non-degenerate points (fractional lattice coords) so a refactor that
  // changes the interpolation weights fails.
  for (const [x, y, s] of [[0.37, 0.91, 3], [-1.25, 4.4, 8], [10.05, -10.01, 8]]) {
    assert.equal(valueNoise(x, y, s), refValueNoise(x, y, s));
  }
  const h = refHash2(2, 2);
  assert.ok(h >= 0 && h < 1); // (0.5,0.5,4) hits exact lattice point (2,2)
  assert.equal(valueNoise(0.5, 0.5, 4), h);
});

test('hash2 is deterministic and differs across lattice points', () => {
  assert.equal(hash2(3, 7), refHash2(3, 7));
  assert.equal(hash2(3, 7), hash2(3, 7));
  assert.notEqual(refHash2(2, 2), refHash2(3, 3));
});

test('sandAlbedo: grid-line position = interior base × 0.94 (within 1e-3)', () => {
  // (0, 0.5): frac(0) = 0 < 0.04 -> on a lattice line.
  const line = sandAlbedo(0.0, 0.5);
  const lineRef = refSand(0.0, 0.5, true);
  approx(line.r, lineRef.r, 1e-9);
  approx(line.g, lineRef.g, 1e-9);
  approx(line.b, lineRef.b, 1e-9);
  // vs. the un-factored (interior) value at the same point:
  const interiorRef = refSand(0.0, 0.5, false);
  approx(line.r, interiorRef.r * 0.94, 1e-3);
  approx(line.g, interiorRef.g * 0.94, 1e-3);
  approx(line.b, interiorRef.b * 0.94, 1e-3);
  // A true interior point (frac 0.5 on both axes, outside any line band).
  const inside = sandAlbedo(0.5, 0.5);
  const inRef = refSand(0.5, 0.5, false);
  approx(inside.r, inRef.r, 1e-9);
  approx(inside.g, inRef.g, 1e-9);
  approx(inside.b, inRef.b, 1e-9);
});

test('sandAlbedo base color stays within ±14% of #c9b58c (±12% modulation)', () => {
  for (let k = 0; k < 400; k++) {
    // Pseudo-random positions inside the arena; snapped to cell centers
    // (frac 0.5) so they sit outside the 0.04 grid-line bands.
    const x = ((((k * 2654435761 + 13) >>> 0) / 4294967296) - 0.5) * 19 + 0.5;
    const y = ((((k * 40503 + 1) * 668265263) >>> 0) / 4294967296 - 0.5) * 19 + 0.5;
    const cx = Math.floor(x) + 0.5;
    const cy = Math.floor(y) + 0.5;
    const a = sandAlbedo(cx, cy);
    for (const ch of ['r', 'g', 'b']) {
      assert.ok(
        a[ch] >= BASE[ch] * 0.86 && a[ch] <= BASE[ch] * 1.14,
        `sandAlbedo(${cx}, ${cy}) ${ch}=${a[ch]} outside ±14% of base`,
      );
    }
  }
});

test('wallColor and FLOOR_SIZE constants', () => {
  assert.equal(wallColor, 0x8d8778);
  assert.equal(FLOOR_SIZE, 20); // GRID * TILE = 20 * 1
});

// --- floor.js (pure part) ---------------------------------------------------

const frac = (v) => v - Math.floor(v);

test('floorTexturePixels(16): size, range, and exact per-pixel samples', () => {
  const size = 16;
  const px = floorTexturePixels(size);
  assert.equal(px.length, size * size * 3);
  for (let k = 0; k < px.length; k++) {
    assert.ok(px[k] >= 0 && px[k] <= 1, `pixel ${k} out of range: ${px[k]}`);
  }
  // Pixel centers are x = (i+0.5)*20/16 - 10 (and likewise for z).
  const step = FLOOR_SIZE / size;
  const wx = (i) => (i + 0.5) * step - FLOOR_SIZE / 2;
  const wz = (j) => (j + 0.5) * step - FLOOR_SIZE / 2;
  // At size 16 every texel center sits >= 0.125 from a cell line, so no
  // 0.94 factor can apply; every pixel must equal sandAlbedo exactly.
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const x = wx(i);
      const z = wz(j);
      assert.ok(Math.min(frac(x), frac(z)) >= 0.04, `texel on line band`);
      const ref = sandAlbedo(x, z);
      const o = (j * size + i) * 3;
      // fp32 storage: compare against fp64 sandAlbedo within float32 eps.
      approx(px[o], ref.r, 1e-6);
      approx(px[o + 1], ref.g, 1e-6);
      approx(px[o + 2], ref.b, 1e-6);
    }
  }
  assert.equal(TEXTURE_SIZE, 512);
});

test('floorTexturePixels(512): pixels on a grid line equal sandAlbedo × 0.94', () => {
  const size = 512;
  const px = floorTexturePixels(size);
  assert.equal(px.length, size * size * 3);
  const step = FLOOR_SIZE / size; // 20/512 = 0.0390625
  const wx = (i) => (i + 0.5) * step - FLOOR_SIZE / 2;
  const wz = (j) => (j + 0.5) * step - FLOOR_SIZE / 2;
  // i=0: x = -10 + 0.01953 -> frac 0.01953 < 0.04 -> on a cell-boundary
  // line band. Sample two pixels on/near that line (j = 0 and j = 1):
  for (const j of [0, 1]) {
    const x = wx(0);
    const z = wz(j);
    assert.ok(frac(x) >= 0 && frac(x) < 0.04, `x=${x} not in line band`);
    const onLine = sandAlbedo(x, z);
    const interior = refSand(x, z, false); // same noise, no 0.94 factor
    approx(onLine.r, interior.r * 0.94, 1e-9); // documented 0.94 factor
    const o = (j * size + 0) * 3;
    approx(px[o], onLine.r, 1e-6); // fp32 storage
    approx(px[o + 1], onLine.g, 1e-6);
    approx(px[o + 2], onLine.b, 1e-6);
    approx(px[o], interior.r * 0.94, 1e-6); // fp32 storage, documented 0.94 factor
  }
});

test('floorTexturePixels defaults to 512×512', () => {
  assert.equal(floorTexturePixels().length, 512 * 512 * 3);
});

const construction = () => {
  if (!THREE) {
    assert.skip({
      msg: 'three not installed — construction smoke is a browser-checklist item (R-TEST-01)',
    });
    return;
  }

  // lights(scene, shadowSize): exactly the R-WORLD-01 two-light rig.
  const added = [];
  const scene = { add: (...a) => added.push(...a) };
  const { hemi, sun } = lights(scene, 1024);
  assert.ok(hemi instanceof THREE.HemisphereLight);
  assert.ok(sun instanceof THREE.DirectionalLight);
  assert.equal(hemi.color.getHex(), 0xbfd9ff);
  assert.equal(hemi.groundColor.getHex(), 0x8a7f6a);
  assert.equal(hemi.intensity, 1.0);
  assert.equal(sun.color.getHex(), 0xffe6c0);
  assert.equal(sun.intensity, 2.2);
  assert.deepEqual(
    [sun.position.x, sun.position.y, sun.position.z],
    [12, 18, 8],
  );
  assert.equal(sun.target.position.x, 0);
  assert.equal(sun.target.position.y, 0);
  assert.equal(sun.target.position.z, 0);
  assert.equal(sun.castShadow, true);
  const sc = sun.shadow.camera;
  assert.equal(sc.left, -13);
  assert.equal(sc.right, 13);
  assert.equal(sc.top, 13);
  assert.equal(sc.bottom, -13);
  assert.equal(sc.near, 4);
  assert.equal(sc.far, 40);
  assert.equal(sun.shadow.mapSize.x, 1024);
  assert.equal(sun.shadow.mapSize.y, 1024);
  // Exactly two lights were added (plus the sun target, which is not a light).
  assert.equal(added.filter((o) => o instanceof THREE.Light).length, 2);
  assert.equal(added.length, 3);
};

test('construction smoke: lights rig, walls group, env texture', construction);

const envBake = () => {
  if (!THREE) {
    assert.skip({
      msg: 'three not installed — skipped (browser checklist item)',
    });
    return;
  }
  const stops = [];
  const fill = [];
  const fakeCanvas = { width: 0, height: 0 };
  const ctx = {
    canvas: fakeCanvas,
    createLinearGradient: (x0, y0, x1, y1) => {
      assert.deepEqual([x0, y0, x1, y1], [0, 0, 0, 2]);
      return { addColorStop: (t, c) => stops.push([t, c]) };
    },
    fillRect: (...a) => fill.push(a),
  };
  const tex = makeEnvTexture(ctx);
  assert.ok(tex instanceof THREE.CanvasTexture);
  assert.equal(tex.image, fakeCanvas);
  assert.equal(tex.mapping, THREE.EquirectangularReflectionMapping);
  assert.deepEqual(stops, [[0, '#bfe4ff'], [1, '#ffe9c8']]);
  assert.equal(SKY_TOP, 0xbfd9ff);
  assert.equal(SKY_HORIZON, 0xffe9c8);
  assert.deepEqual(fill, [[0, 0, 2, 2]]);

  // bakeScene: pmrem.fromEquirectangular pass-through (mock PMREM).
  const seen = [];
  const baked = bakeScene(tex, {
    fromEquirectangular: (t) => {
      seen.push(t);
      return { texture: { baked: true } };
    },
  });
  assert.equal(baked.baked, true);
  assert.equal(seen[0], tex);
};

test('construction smoke: env texture gradient + PMREM bake', envBake);

const wallsSmoke = () => {
  if (!THREE) {
    assert.skip({ msg: 'three not installed — skipped (browser checklist item)' });
    return;
  }
  const group = buildWalls();
  assert.ok(group instanceof THREE.Group);
  assert.equal(group.children.length, 4);
  const materials = new Set(group.children.map((m) => m.material));
  assert.equal(materials.size, 1); // one shared material
  const mat = group.children[0].material;
  assert.equal(mat.color.getHex(), wallColor);
  assert.equal(mat.roughness, 0.8);
  assert.equal(mat.envMapIntensity, 0.4);
  for (const m of group.children) {
    assert.equal(m.castShadow, true);
    assert.equal(m.receiveShadow, true);
    assert.ok(m.geometry instanceof THREE.BoxGeometry);
  }
  const byPos = (x, z) =>
    group.children.find(
      (m) =>
        Math.abs(m.position.x - x) < 1e-9 && Math.abs(m.position.z - z) < 1e-9,
    );
  const specs = [
    [10.4, 0, [0.4, 0.5, 20.8]],
    [-10.4, 0, [0.4, 0.5, 20.8]],
    [0, 10.4, [20.8, 0.5, 0.4]],
    [0, -10.4, [20.8, 0.5, 0.4]],
  ];
  for (const [x, z, dims] of specs) {
    const m = byPos(x, z);
    assert.ok(m, `missing wall at (${x}, ${z})`);
    approx(m.position.y, 0.25, 1e-12);
    const s = m.geometry.parameters;
    approx(s.width, dims[0], 1e-9);
    approx(s.height, dims[1], 1e-9);
    approx(s.depth, dims[2], 1e-9);
  }
};

test('construction smoke: four wall boxes, shared material, exact positions', wallsSmoke);
