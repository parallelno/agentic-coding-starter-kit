// SNAKE — Cinematic Edition: quality tier provider.

export const MOBILE_RE = /Android|iPhone|iPad|Mobile/i;

export function isMobileUA(ua) {
  return !!ua && MOBILE_RE.test(ua);
}

const TIERS = ['low', 'standard', 'high'];

// Precedence: explicit `param` > persisted `stored` > mobile/desktop default.
// Invalid/unknown `param` and `stored` values fall straight through.
export function pickQuality({ param, stored, isMobile } = {}) {
  if (TIERS.includes(param)) return param;
  if (TIERS.includes(stored)) return stored;
  return isMobile ? 'low' : 'standard';
}

// Frozen per-tier resource config (R-PERF-01).
export function tierConfig(tier) {
  const map = {
    low: { pixelRatio: 1, dust: 80, composer: false, shadows: 1024 },
    standard: { pixelRatio: 1.5, dust: 240, composer: 'smaa', shadows: 2048 },
    high: { pixelRatio: 2, dust: 500, composer: 'smaa+bloom', shadows: 2048 },
  };
  if (!Object.prototype.hasOwnProperty.call(map, tier)) {
    throw new Error('unknown quality tier: ' + tier);
  }
  return map[tier];
}
