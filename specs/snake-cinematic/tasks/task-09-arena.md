# Task 09 — Arena (ground, walls, sun setup)

- **Wave:** 3
- **Files to create:** `js/renderer/arena.js`
- **Depends on:** `js/renderer/renderer.js` (W2) for `Renderer`,
  `js/config/constants.js` (W1). Uses Three.js.

## Description

Builds the sunlit arena: a large ground plane covering the grid, surrounding
walls/boundary that visually mark the lethal edge, and any ground detail. All
materials are procedural (PBR `MeshStandardMaterial`, optionally a small
generated `CanvasTexture` for a subtle ground pattern — no external assets).
Returns a `THREE.Group` the integration adds to the scene. The "sun" directional
light + hemi fill are created by the `Renderer` (task-04); this module only
builds geometry and shadows.

## Technical spec

```js
import * as THREE from 'three';
import { GRID } from '../config/constants.js';

export function createArena(renderer) {
  const g = new THREE.Group();
  const ground = makeGround();      // plane sized GRID.W x GRID.H, receiveShadow
  const bounds = makeBounds();      // low walls around the 4 edges (the hazard)
  g.add(ground, bounds);
  // optional: makeGround uses a 128x128 CanvasTexture (noise/brush) for albedo,
  //   roughness ~0.95. Keep it cheap; reuse one texture.
  return g;
}
```

- Ground top surface sits at `y = 0` (water will be placed slightly above at
  `y = WATER_OFFSET_Y`; see constants). Grid plane spans `±GRID.W/2`.
- `makeGround()`: `PlaneGeometry(GRID.W, GRID.H)` rotated flat, `side:
  DoubleSide`, `receiveShadow = true`. Warm neutral albedo.
- `makeBounds()`: four thin boxes (height ~0.5) just outside each grid edge to
  read as the wall you die on; `castShadow = true` on medium/high.
- Ground should read as "sunlit": rely on `renderer.sun`. Optionally add a very
  faint radial darkening via the ground texture to focus the center.
- Respect quality: only enable `castShadow` where `renderer.quality.shadows.enabled`.

## Acceptance criteria
- `createArena(renderer)` returns a Group whose ground spans the full `±10.5`
  (GRID.W/2) in X and Z and is centered at origin.
- Walls exist on all four edges and are visible from the default camera angle.
- No external texture/asset URLs; any `CanvasTexture` is generated at runtime.
- Switching renderer to `low` (shadows off) leaves the arena rendering correctly.
