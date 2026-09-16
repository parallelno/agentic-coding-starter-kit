# Task 11 — Dust Particles

- **Wave:** 3
- **Files to create:** `js/renderer/dust.js`
- **Depends on:** `js/config/constants.js` (W1), `js/renderer/renderer.js` (W2).
  Uses Three.js.

## Description

Drifting environmental dust suspended in the sunlit arena: a single
`THREE.Points` cloud with a soft round sprite (procedural, generated on a canvas
→ `Texture`). Count is driven by the quality tier (`renderer.quality.dustCount`;
`0` on low). Motion is a gentle upward drift + slow horizontal noise, wrapping
within the arena bounds. Additive blending for a sunbeam look. No external
assets; the dust texture is generated procedurally.

## Technical spec

```js
import * as THREE from 'three';

export function makeDustTex() { /* canvas → soft white radial blob → THREE.Texture */ }

export class Dust {
  constructor(renderer) {
    this.count = Math.max(0, Math.round(renderer.quality.dustCount));
    this.rebuild();               // creates BufferGeometry + Points
  }
  rebuild() {
    // position: random within arena footprint (±GRID, y in [0..~GRID_H*0.6])
    // per-particle speed + phase stored in Float32 arrays (not objects)
    // PointsMaterial: size ~0.05, map makeDustTex(), transparent, depthWrite false
    //   blending AdditiveBlending, opacity ~0.5, sizeAttenuation true
    this.points = new THREE.Points(geo, mat);
  }
  setQuality(name) { /* re-read renderer.quality.dustCount for the new tier?
                      // in practice main.js rebuilds Dust on tier change;
                      // expose rebuild() to reuse */ }
  update(dt, t) { /* advance positions by drifty noise; wrap; mutate
                   // attribute array; set needsUpdate = true */ }
  dispose() {}
}
```

- Use typed arrays for particle state (positions, velocities/phases) to avoid
  per-frame garbage. Preallocate `positions` `Float32Array(3*count)`.
- Vertical drift: `y += dt * 0.15` plus `sin(t*0.3 + phase)` sway in x/z by a
  small amount. Wrap when `y > ceiling` back to floor.
- When `count === 0`, `points` is `undefined` / not added — `update` no-ops.
- Keep `points.frustumCulled = false` (positions update in place) to avoid
  pop-in.

## Acceptance criteria
- On `high`, `Dust` yields ~900 points; on `low`, none and `update` is a no-op.
- Particles stay within the arena footprint vertically/horizontally (wrapped).
- No per-frame array allocation (only the preallocated buffer is mutated).
- Rendered additively, visible in sunbeams, invisible on a white background
  without the grade (fine — grade handles it).
