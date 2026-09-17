// Procedural sand/concrete material math. Pure + Node-importable: this module
// imports NOTHING (no three, no DOM) so the color/noise oracles can be asserted
// directly under `node --test`.
//
// Per R-WORLD-03 / R-WORLD-01 the floor is a procedural sand albedo: a base
// warm sand tone modulated by 2D value noise, with faint 1-cell grid lines.

import { GRID, TILE } from '../game/core.js';

export const FLOOR_SIZE = GRID * TILE; // 20 world units spanning the grid
export const wallColor = 0x8d8778;

// Fixed integer salt for deterministic hashing.
const SALT = 0x9e3779b1;

// Base sand albedo #c9b58c in normalized [0,1] per channel.
export const SAND_BASE = {
  r: 0xc9 / 255,
  g: 0xb5 / 255,
  b: 0x8c / 255,
};

/**
 * hash2(c, r) -> deterministic pseudo-random value in [0,1) from integer
 * lattice coords (c, r). Reference formula (documented; the test re-derives it):
 *
 *   h = (c * 374761393 + r * 668265263 + SALT) >>> 0
 *   h = (h ^ (h >>> 13)) >>> 0
 *   h = (h * 1274126177) >>> 0
 *   h = (h ^ (h >>> 16)) >>> 0
 *   return h / 4294967295
 *
 * (32-bit word arithmetic; `>>> 0` coerces to unsigned.)
 */
export function hash2(c, r) {
  const ic = Math.floor(c);
  const ir = Math.floor(r);
  let h = (ic * 374761393 + ir * 668265263 + SALT) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  h = (Math.imul(h, 1274126177)) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967295;
}

/**
 * valueNoise(x, y, scale) -> classic 2D value noise in [0,1):
 *
 *   sx = x * scale, sy = y * scale
 *   x0 = floor(sx), y0 = floor(sy)
 *   u  = smoothstep(frac(sx)) = f*f*(3-2f), f = sx - x0
 *   v  = smoothstep(frac(sy))
 *   bilinear interpolation of hash2 at the four corners (x0,y0),(x0+1,y0),
 *   (x0,y0+1),(x0+1,y0+1).
 *
 * Reference formula (the test re-implements it and asserts equality):
 *
 *   t = v00 + (v10 - v00) * u          // v = hash2(x0,   y0)
 *   b = v01 + (v11 - v01) * u          // v0/v10 along x
 *   return t + (b - t) * v
 *
 * Oracle: valueNoise(0.5, 0.5, 4) == hash2(2, 2) because frac(sx)=frac(sy)=0.
 */
export function valueNoise(x, y, scale) {
  const sx = x * scale;
  const sy = y * scale;
  const x0 = Math.floor(sx);
  const y0 = Math.floor(sy);
  const fx = sx - x0;
  const fy = sy - y0;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const v00 = hash2(x0, y0);
  const v10 = hash2(x0 + 1, y0);
  const v01 = hash2(x0, y0 + 1);
  const v11 = hash2(x0 + 1, y0 + 1);
  const top = v00 + (v10 - v00) * u;
  const bot = v01 + (v11 - v01) * u;
  return top + (bot - top) * v;
}

/**
 * sandTint(c, r) -> the per-cell brightness multiplier in [0.88, 1.12] (i.e.
 * base +/- 12%) driven by value noise sampled at normalized grid coords.
 * Kept separate from sandAlbedo so the 0.94 grid-line factor can be tested
 * independently of the noise term.
 */
export function sandTint(c, r) {
  return 0.88 + 0.24 * valueNoise(c / GRID, r / GRID, 4);
}

/**
 * gridFactor(c, r) -> 0.94 on/faint (within 0.04 of a cell edge), else 1.0.
 * A "cell edge" is where either coordinate is within 0.04 of an integer
 * (min(fract(c), fract(r)) < 0.04), producing the darker grid line.
 */
export function gridFactor(c, r) {
  const fc = c - Math.floor(c);
  const fr = r - Math.floor(r);
  return Math.min(fc, fr) < 0.04 ? 0.94 : 1.0;
}

/**
 * sandAlbedo(c, r) -> {r, g, b} in [0,1]. Base sand * sandTint * gridFactor,
 * clamped to [0,1]. c, r are cell coordinates (may be fractional for texture
 * sampling).
 */
export function sandAlbedo(c, r) {
  const t = sandTint(c, r);
  const g = gridFactor(c, r);
  return {
    r: clamp01(SAND_BASE.r * t * g),
    g: clamp01(SAND_BASE.g * t * g),
    b: clamp01(SAND_BASE.b * t * g),
  };
}

function clamp01(x) {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}
