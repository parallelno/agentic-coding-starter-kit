// SNAKE — Cinematic Edition: deterministic + default RNG provider.

// mulberry32 — a small, fast, well-distributed 32-bit PRNG.
// First three outputs for seed 1 (documented test oracle):
//   0.196518..., 0.995407..., 0.408581...  (see tests/providers.test.mjs)
export function seededRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function defaultRng() {
  return Math.random;
}
