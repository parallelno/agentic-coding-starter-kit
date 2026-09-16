export const QUALITY_TIERS = {
  low: {
    label: 'Low',
    pixelRatio: 1,
    shadows: { enabled: false, mapSize: 512 },
    dustCount: 0,
    waterSegments: 16,
    post: { bloom: false, vignette: true, tonemap: true },
    followShake: false,
  },
  medium: {
    label: 'Medium',
    pixelRatio: 1.5,
    shadows: { enabled: true, mapSize: 1024 },
    dustCount: 300,
    waterSegments: 32,
    post: { bloom: true, vignette: true, tonemap: true },
    followShake: true,
  },
  high: {
    label: 'High',
    pixelRatio: 2,
    shadows: { enabled: true, mapSize: 2048 },
    dustCount: 900,
    waterSegments: 64,
    post: { bloom: true, vignette: true, tonemap: true },
    followShake: true,
  },
};

export function detectQuality() {
  const mobile =
    /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) ||
    ('ontouchstart' in window);
  const dpr = window.devicePixelRatio || 1;
  const cores = navigator.hardwareConcurrency || 2;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) return mobile ? 'low' : 'medium';
  if (mobile) return (dpr >= 2 && cores >= 8) ? 'medium' : 'low';
  return dpr >= 2 ? 'high' : 'medium';
}
