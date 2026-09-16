# Task 10 — Water Pond (procedural, slow hazard)

- **Wave:** 3
- **Files to create:** `js/renderer/water.js`
- **Depends on:** `js/config/constants.js` (W1), `js/game/grid.js` (W2),
  `js/renderer/renderer.js` (W2), `js/util/eventBus.js` (W1). Uses Three.js.

## Description

Defines which grid cells are water (the fixed procedural layout from
requirements.md §Water layout) and renders them as a living, rippling surface
just above the ground. Water is a **slow** hazard, not death: it exposes
`isWater(col,row)` for the state machine (to slow the snake) and emits a
`splash` SFX + a small `shake` the first time the head enters water
(that logic lives in the state machine; this module only provides the query +
visual + a hook `markHeadWater(col,row)` to play the ripple/SFX once per entry).

## Technical spec

Fixed layout (deterministic, no assets). Cells as an oval pond + a stream:
```
oval(center c=5, r=5, a=3, b=2): cell (col,row) is water if
    ((col-5)^2 / a^2) + ((row-5)^2 / b^2) <= 1
stream: col in [14..16] and row in [8..13]
```
Guards: drop any water cell within manhattan distance ≤ 1 of `CENTER (10,10)`
so spawn stays dry.

```js
import * as THREE from 'three';
import { WATER_OFFSET_Y, WATER_WOBBLE } from '../config/constants.js';
import { CENTER } from '../config/constants.js';
import { manhattan } from '../game/grid.js';

export function buildWaterCells() { /* -> Set<string> of "col,row", applying guards */ }
export class Water {
  constructor(renderer) {
    this.cells = buildWaterCells();
    this.surface = makeSurface(renderer, this.cells);  // group of quads above ground
    this.normalTex = makeAnimatedNormalTexture();      // shared DataTexture
  }
  isWater(col,row) { return this.cells.has(`${col},${row}`); }
  key(col,row) { return `${col},${row}`; }
  markHeadWater(col,row) { /* one ripple burst at that cell; optional SFX via bus */ }
  update(dt, t) { /* advance animated normal map: normalTex.offset.x += dt*… */ }
  dispose() {}
}
```

- `makeSurface`: one mesh per water cell (or a merged geometry): a quad at
  `y = WATER_OFFSET_Y` above ground, sized `CELL x CELL`, using
  `MeshStandardMaterial` with `roughness ~0.05`, `metalness ~0.0`, `transparent`,
  `opacity ~0.85`, a blue-ish color, and the animated normal map
  (`normalScale` moderate) so highlights ripple. `castShadow`/`receiveShadow=false`.
- `makeAnimatedNormalTexture`: generate a `DataTexture` (e.g. 128×128 RGBA) from
  a procedural 2D noise (sum of sines / value noise) at build time, wrap repeat,
  and per frame update by scrolling `offset` (cheap) to give moving ripples.
  Reuse the single texture across all cells.
- Segment count / texture detail scale with `renderer.quality.waterSegments`
  (coarser on low).
- `markHeadWater` plays a short ripple: temporarily boost `normalScale` at that
  cell then decay; emit `bus.emit('sfx', {name:'splash'})` and a tiny
  `bus.emit('shake', {power:0.15})`. Guard so it only fires on a new entry
  (callers gate this; keep a `lastEntry` internally as a safety net).

## Acceptance criteria
- `isWater` returns true exactly for the oval+stream cells, and **false** for
  the center (10,10) and its immediate neighbors.
- Surfaced quads sit at `y = WATER_OFFSET_Y` and cover each water cell at the
  correct world position (via `toWorld`).
- The normal map visibly animates over time (offset advances) without reallocating
  the texture each frame.
- `markHeadWater` fires the splash SFX once per fresh entry (repeated stays quiet
  until a different/out-then-re-enter).
