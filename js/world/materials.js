// js/world/materials.js — pure PBR material math (T06, R-WORLD-03, R-ARCH-06).
// Node-importable with no DOM and no `three` import: deterministic texture math
// and material constants only. No per-frame methods (R-PERF-04).

export const wallColor = 0x8d8778;

// FLOOR_SIZE = GRID * TILE (T02 contract: GRID 20, TILE 1.0) = 20 world units.
export const FLOOR_SIZE = 20;

// Base sand albedo #c9b58c = (201, 181, 140).
const SAND_BASE = { r: 201 / 255, g: 181 / 255, b: 140 / 255 };

// Fixed integer salt for the hash — part of the documented oracle.
const SALT = 0x9e3779b9;

// World-space frequency of the sand grain (grains per world unit).
const NOISE_SCALE = 8;

// Grid-line rule: a 1-cell grid of darker lines (factor GRID_LINE_FACTOR)
// wherever the world-space cell coordinate is within CELL_EPS of a lattice
// line, i.e. min(c frac, r frac) < 0.04 (contract wording: within 0.04 of 0).
const GRID_LINE_FACTOR = 0.94;
const CELL_EPS = 0.04;

const frac = (v) => v - Math.floor(v);

/**
 * hash2(c, r) -> [0, 1)
 * Deterministic 2D integer-lattice hash, seeded by the fixed salt:
 *   h = ((c * 374761393 + r * 668265263) ^ SALT) * 2654435761  (unsigned 32-bit)
 *   h / 2^32
 */
export function hash2(c, r) {
  const ic = c | 0;
  const ir = r | 0;
  let h = (ic * 374761393 + ir * 668265263) ^ SALT;
  h = Math.imul(h, 2654435761);
  return (h >>> 0) / 4294967296;
}

/**
 * valueNoise(x, y, scale) -> [0, 1]
 * Reference 2D value noise: bilinear interpolation over hash2 at the integer
 * lattice, at `scale` frequency. Exact formula (the documented oracle —
 * tests recompute it independently):
 *   (x, y)      := (x * scale, y * scale)
 *   (ix, iy)    := floor of each;  (fx, fy) := fractional parts
 *   u = fx * fx * (3 - 2*fx)       v = fy * fy * (3 - 2*fy)   // smoothstep
 *   a = hash2(ix, iy)       b = hash2(ix+1, iy)
 *   c = hash2(ix, iy+1)     d = hash2(ix+1, iy+1)
 *   valueNoise = lerp(lerp(a, b, u), lerp(c, d, u), v)
 */
export function valueNoise(x, y, scale) {
  const sx = x * scale;
  const sy = y * scale;
  const ix = Math.floor(sx);
  const iy = Math.floor(sy);
  const fx = sx - ix;
  const fy = sy - iy;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy);
  const b = hash2(ix + 1, iy);
  const c = hash2(ix, iy + 1);
  const d = hash2(ix + 1, iy + 1);
  return (a + (b - a) * u) + ((c + (d - c) * u) - (a + (b - a) * u)) * v;
}

/**
 * sandAlbedo(c, r) -> {r, g, b} in [0, 1]
 * (c, r) are world-space cell coordinates (arena spans [-10, 10]^2).
 * Base #c9b58c modulated ±12% by valueNoise(c, r, NOISE_SCALE), plus a
 * faint 1-cell grid of darker lines (factor 0.94) applied when a lattice
 * line is within CELL_EPS: min(frac(c), frac(r)) < 0.04.
 */
export function sandAlbedo(c, r) {
  const n = valueNoise(c, r, NOISE_SCALE);
  const f = 0.88 + 0.24 * n; // n in [0,1] -> factor in [0.88, 1.12]
  const onLine = Math.min(frac(c), frac(r)) < CELL_EPS;
  const g = onLine ? GRID_LINE_FACTOR : 1;
  return { r: SAND_BASE.r * f * g, g: SAND_BASE.g * f * g, b: SAND_BASE.b * f * g };
}
