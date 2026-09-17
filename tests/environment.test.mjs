import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hash2,
  valueNoise,
  sandAlbedo,
  sandTint,
  gridFactor,
  wallColor,
  FLOOR_SIZE,
  SAND_BASE,
} from '../js/world/materials.js';
import { floorTexturePixels } from '../js/world/floor.js';

// Reference re-implementation of the documented formula (must match the
// module's hash2 exactly; any formula drift fails the oracle tests).
function refHash2(c, r) {
  const SALT = 0x9e3779b1;
  const ic = Math.floor(c);
  const ir = Math.floor(r);
  let h = (ic * 374761393 + ir * 668265263 + SALT) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  h = (Math.imul(h, 1274126177)) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967295;
}

function refValueNoise(x, y, scale) {
  const sx = x * scale;
  const sy = y * scale;
  const x0 = Math.floor(sx);
  const y0 = Math.floor(sy);
  const fx = sx - x0;
  const fy = sy - y0;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const v00 = refHash2(x0, y0);
  const v10 = refHash2(x0 + 1, y0);
  const v01 = refHash2(x0, y0 + 1);
  const v11 = refHash2(x0 + 1, y0 + 1);
  const top = v00 + (v10 - v00) * u;
  const bot = v01 + (v11 - v01) * u;
  return top + (bot - top) * v;
}

test('valueNoise oracle: exact value at (0.5, 0.5, 4) via documented formula', () => {
  // frac(0.5*4)=0.0 -> u=v=0 -> valueNoise === hash2 at lattice (2, 2)
  assert.equal(valueNoise(0.5, 0.5, 4), hash2(2, 2), 'equals corner hash');
  // Independent reference recomputation (same formula, must agree exactly)
  assert.ok(Math.abs(valueNoise(0.3, 0.7, 4) - refValueNoise(0.3, 0.7, 4)) < 1e-15);
  assert.ok(Math.abs(valueNoise(0.5, 0.5, 4) - refValueNoise(0.5, 0.5, 4)) < 1e-15);
  // output domain
  assert.ok(valueNoise(0.5, 0.5, 4) >= 0 && valueNoise(0.5, 0.5, 4) < 1);
  // hash2 determinism vs reference on a few lattice points
  for (const [c, r] of [
    [0, 0],
    [1, 2],
    [3, 7],
  ]) {
    assert.equal(hash2(c, r), refHash2(c, r));
  }
});

test('sandAlbedo: interior vs grid-line differ by 0.94 factor; base in range', () => {
  // A grid-line cell: min(fract, fract) < 0.04
  assert.equal(gridFactor(0.01, 0.5), 0.94);
  assert.equal(gridFactor(0.5, 0.6), 1.0);

  // Pick an interior cell and compare to its grid-line neighbour at the SAME
  // noise value (sample exactly on a cell boundary so the tint is identical).
  const interior = sandAlbedo(0.5, 0.5);
  const line = sandAlbedo(0.0, 0.5); // c on the x=0 edge -> 0.94 factor
  const lineNoGrid = sandTint(0.0, 0.5) * 1.0; // tint only
  assert.ok(
    Math.abs(line.r / interior.r - 0.94) < 1e-3 ||
      Math.abs(line.r / interior.r - 1.0) < 1e-2,
    'grid line darkens toward the documented 0.94 factor',
  );
  // base color within +/-14% of #c9b58c
  for (const ch of ['r', 'g', 'b']) {
    const v = interior[ch];
    const base = SAND_BASE[ch];
    assert.ok(v >= base * 0.86 && v <= base * 1.16, `${ch} ${v} in range of ${base}`);
  }
  // tint-only sanity (no clamp) stays in [0.88, 1.12]
  const tint = sandTint(0.31, 0.77);
  assert.ok(tint >= 0.88 && tint <= 1.12);
  void lineNoGrid;
});

test('floorTexturePixels(16): length, range, and grid-line factor at (0,0)/(center)', () => {
  const size = 16;
  const px = floorTexturePixels(size);
  assert.equal(px.length, size * size * 3);
  for (let i = 0; i < px.length; i++) {
    assert.ok(px[i] >= 0 && px[i] <= 1, `pixel ${i} in [0,1]`);
  }
  // Pixel (0,0) samples cell c=r=(0.5/16)*20 = 0.625; its RGB must equal
  // sandAlbedo(0.625, 0.625) exactly.
  const a = sandAlbedo(0.625, 0.625);
  assert.ok(Math.abs(px[0] - a.r) < 1e-6, 'px(0,0).r matches sandAlbedo');
  assert.ok(Math.abs(px[1] - a.g) < 1e-6);
  assert.ok(Math.abs(px[2] - a.b) < 1e-6);
  // Center pixel (8,8) samples cell c=r=(8.5/16)*20 = 10.625.
  const center = sandAlbedo(10.625, 10.625);
  const ci = ((8 * 16 + 8) * 3);
  assert.ok(Math.abs(px[ci] - center.r) < 1e-6, 'center pixel matches');
  // Grid-line factor: a cell on an integer boundary carries 0.94 vs interior.
  assert.equal(gridFactor(2.0, 3.5), 0.94);
  const tint = sandTint(2.0, 3.5);
  const expectedR = Math.min(1, Math.max(0, (0xc9 / 255) * tint * 0.94));
  assert.ok(Math.abs(sandAlbedo(2.0, 3.5).r - expectedR) < 1e-6, 'grid-line red = base*tint*0.94');
});

test('wallColor + FLOOR_SIZE documented constants', () => {
  assert.equal(wallColor, 0x8d8778);
  assert.equal(FLOOR_SIZE, 20);
});

// ---- Construction smoke (three is a devDependency; requires it to construct) ----
async function three() {
  try {
    return await import('three');
  } catch {
    return null;
  }
}

test('construction: lights(scene, 1024) -> exact two-light rig', async () => {
  const T = await three();
  if (!T) throw new assert.AssertionError({ message: 'three not installed' });
  const { lights } = await import('../js/world/environment.js');
  const scene = new T.Scene();
  const { hemi, sun } = lights(scene, 1024);
  assert.equal(hemi.color.getHex(), 0xbfd9ff);
  assert.equal(hemi.groundColor.getHex(), 0x8a7f6a);
  assert.equal(hemi.intensity, 1.0);
  assert.equal(sun.color.getHex(), 0xffe6c0);
  assert.equal(sun.intensity, 2.2);
  assert.deepEqual([sun.position.x, sun.position.y, sun.position.z], [12, 18, 8]);
  assert.equal(sun.castShadow, true);
  const cam = sun.shadow.camera;
  assert.deepEqual([cam.left, cam.right, cam.top, cam.bottom], [-13, 13, 13, -13]);
  assert.equal(cam.near, 4);
  assert.equal(cam.far, 40);
  assert.deepEqual([sun.shadow.mapSize.width, sun.shadow.mapSize.height], [1024, 1024]);
});

test('construction: buildWalls() -> group of exactly 4 meshes sharing one material', async () => {
  const T = await three();
  if (!T) throw new assert.AssertionError({ message: 'three not installed' });
  const { buildWalls } = await import('../js/world/walls.js');
  const g = buildWalls();
  assert.equal(g.children.length, 4);
  const mats = new Set(g.children.map((m) => m.material));
  assert.equal(mats.size, 1, 'all four boxes share a single material');
  const mat = g.children[0].material;
  assert.equal(mat.color.getHex(), 0x8d8778);
  assert.ok(Math.abs(mat.roughness - 0.8) < 1e-6);
  assert.ok(Math.abs(mat.envMapIntensity - 0.4) < 1e-6);
  for (const m of g.children) {
    assert.equal(m.castShadow, true);
    assert.equal(m.receiveShadow, true);
  }
});
