// js/providers/rng.js — deterministic + default random sources (T04).
//
// No DOM access at import. `seededRng` is a mulberry32 PRNG used for
// reproducible food respawn; `defaultRng` delegates to Math.random.

// mulberry32 — small, fast, deterministic 32-bit generator.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296; // [0, 1)
  };
}

/**
 * Deterministic PRNG returning `() => number in [0,1)`.
 * Test oracle for seed 1 (documented):
 *   0.62707394058816135, 0.0027357211802154779, 0.52744703995995224
 */
export function seededRng(seed) {
  return mulberry32(Number(seed) || 0);
}

/** Non-deterministic default source (Math.random). */
export function defaultRng() {
  return Math.random;
}
