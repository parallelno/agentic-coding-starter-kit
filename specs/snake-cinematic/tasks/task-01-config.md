# Task 01 — Config & Quality Tiers

- **Wave:** 1
- **Files to create:** `js/config/constants.js`, `js/config/quality.js`
- **Depends on:** nothing.

## Description

Create the two shared config leaf modules that the whole game imports:
gameplay/geometry constants, and the three quality-tier definitions plus a
device detector. Everything else in the project imports from these, so they
must match the contract in `requirements.md` exactly.

## Technical spec

### `js/config/constants.js`
Export these (exact names/values — other tasks rely on them):

```js
export const GRID = { W: 21, H: 21, CELL: 1.0 };
export const CENTER = { col: 10, row: 10 };
export const DIRECTION = {
  UP:    { x: 0, z: -1 },
  DOWN:  { x: 0, z: 1 },
  LEFT:  { x: -1, z: 0 },
  RIGHT: { x: 1, z: 0 },
};
export const SPEED = {
  baseCellsPerSec: 8,
  perFood: 0.35,
  maxCellsPerSec: 15,
  waterFactor: 0.5,
};
export const SCORE_PER_FOOD = 10;
export const SNAKE_START_LENGTH = 3;
export const WATER_WOBBLE = 0.35;
export const WATER_OFFSET_Y = 0.02; // water surface height above ground top
```

### `js/config/quality.js`
```js
export const QUALITY_TIERS = { low: {…}, medium: {…}, high: {…} };
// low/medium/high exactly as documented in requirements.md §Quality tiers.
export function detectQuality() { /* returns 'low'|'medium'|'high' */ }
```

`detectQuality()` implementation:
```js
export function detectQuality() {
  const mobile =
    /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) ||
    ('ontouchstart' in window);
  const dpr = window.devicePixelRatio || 1;
  const cores = navigator.hardwareConcurrency || 2;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) return mobile ? 'low' : 'medium'; // cap, and low disables shake
  if (mobile) return (dpr >= 2 && cores >= 8) ? 'medium' : 'low';
  return dpr >= 2 ? 'high' : 'medium';
}
```
Each tier object must carry: `label`, `pixelRatio`, `shadows{enabled,mapSize}`,
`dustCount` (0/300/900), `waterSegments` (16/32/64), `post{bloom,vignette,tonemap}`,
`followShake` (bool).

## Acceptance criteria
- `import { GRID, DIRECTION, SPEED } from './config/constants.js'` works in the
  module graph.
- `detectQuality()` returns a valid tier string for a desktop and a mobile-like
  UA; reduced-motion caps at `medium`/`low`.
- All three tiers present and non-overlapping; values match requirements.md.
