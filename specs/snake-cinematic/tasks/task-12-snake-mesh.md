# Task 12 — Snake Mesh (3D, smoothed)

- **Wave:** 3
- **Files to create:** `js/renderer/snakeMesh.js`
- **Depends on:** `js/config/constants.js` (W1), `js/game/grid.js` (W2 for
  `toWorld`), `js/renderer/renderer.js` (W2), `js/util/eventBus.js` (W1).
  Uses Three.js.

## Description

The 3D visual body of the snake. While gameplay advances in **discrete** grid
steps, this module renders **smoothed** motion: it holds per-segment current
world positions and lerps them toward the target cell centers each frame, so
the snake glides even at high speeds. It also provides a distinct head, and
reacts to camera shake / water wobble by applying a subtle body sway. No assets
— materials are procedural PBR.

## Technical spec

```js
import * as THREE from 'three';
import { toWorld } from '../game/grid.js';
import { WATER_WOBBLE } from '../config/constants.js';

export class SnakeMesh {
  constructor(renderer) {
    this.segments = [];   // { group, target:{x,z} } one Group per body cell
    this.radius = 0.32;
    this.headRadius = 0.4;
    this.material = makeBodyMaterial();      // procedural PBR (green-ish, rough ~0.4)
    this.rippleTilt = 0;                     // drives wobble in water
  }
  // Set targets from snake.body (head first) each time the body advances.
  setBody(body) { /* body: [{col,row},…]; grow/shrink segment count as needed */ }
  // Called once per frame: move every segment's current pos toward its target
  // by factor alpha = 1 - pow(base, dt) (frame-rate independent smoothing).
  update(dt, t) { /* lerp + apply subtle sway in water + castShadow */ }
  setWaterWobble(active) { this.inWater = !!active; }  // state toggles each step
  dispose() {}
}
```

- Segment visuals: a short cylinder/rounded box (`CylinderGeometry` oriented
  along the body) or a capsule approximated; radius ~0.32, head a bit larger
  (~0.4) with a distinct material (slightly glossy, brighter). `castShadow = true`
  on medium/high (respect `renderer.quality.shadows.enabled`).
- Smoothing: store each segment's **current** `{x,z}`. Target = `toWorld(cell)`.
  Each frame: `cur += (target - cur) * (1 - Math.pow(0.0001, dt))` (a strong
  ease that still looks continuous). Rotate each segment to face the next
  segment (lookAt the next segment's current pos).
- Water wobble: when `inWater`, add a small sinusoidal vertical/tilt sway
  (`sin(t*10) * WATER_WOBBLE * 0.05`) to segments and a head tilt, decaying out
  when `inWater` is false.
- Reuse the same material/geometry instances across segments (clone meshes,
  share material) to avoid state churn. Grow = add a segment at the tail;
  shrink = remove from tail.
- Reuse `Vector3` temporaries in `update` (no per-frame allocation).

## Acceptance criteria
- `setBody` with a length-3 body creates 3 segments (head distinct).
- Advancing the body one step then calling `update` many frames glides the head
  to the new cell center smoothly (no teleport on the first render).
- `setWaterWobble(true)` introduces a visible sinusoidal sway; `false` decays it.
- Segment count tracks `body.length` (eats add a tail segment; it lags then
  fills in — acceptable, head is always current).
- No per-frame allocation in `update`.
