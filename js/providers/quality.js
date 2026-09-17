// js/providers/quality.js — render-quality tier selection (T04).
//
// No DOM access at import; User-Agent is read only when isMobileUA is *called*
// with an explicit arg, or by callers that pass one. Tiers map to the exact
// render config in R-PERF-01.

export const MOBILE_RE = /Android|iPhone|iPad|Mobile/i;

const TIERS = ['low', 'standard', 'high'];

const TIER_CONFIG = {
  low: { pixelRatio: 1, dust: 80, composer: false, shadows: 1024 },
  standard: { pixelRatio: 1.5, dust: 240, composer: 'smaa', shadows: 2048 },
  high: { pixelRatio: 2, dust: 500, composer: 'smaa+bloom', shadows: 2048 },
};

/** True if a user agent string indicates a mobile device. */
export function isMobileUA(ua) {
  const s = ua == null ? '' : String(ua);
  return MOBILE_RE.test(s);
}

function isValidTier(t) {
  return TIERS.includes(t);
}

/**
 * Precedence: `param` (if a valid tier) > `stored` (if a valid tier) >
 * `isMobile ? 'low' : 'standard'`. Invalid param/stored fall through.
 */
export function pickQuality({ param, stored, isMobile } = {}) {
  if (isValidTier(param)) return param;
  if (isValidTier(stored)) return stored;
  return isMobile ? 'low' : 'standard';
}

/** Exact per-tier render config (R-PERF-01). Throws on unknown tier. */
export function tierConfig(tier) {
  const cfg = TIER_CONFIG[tier];
  if (!cfg) throw new Error(`unknown quality tier: ${String(tier)}`);
  // Return a copy so callers cannot mutate the canonical map.
  return { ...cfg };
}
