# Task 04 — Renderer

- **Wave:** 2
- **Files to create:** `js/renderer/renderer.js`
- **Depends on:** `js/config/quality.js` (QUALITY_TIERS, detectQuality),
  `js/config/constants.js`. Uses Three.js (imported via the `index.html` import-map:
  `import * as THREE from 'three'` and `import { … } from 'three/addons/…'` — see
  requirements.md for the exact CDN pin `three@0.160.0`).

## Description

Owns the Three.js `Scene`, `PerspectiveCamera`, `WebGLRenderer`, resize handling,
and the per-tier visual scaling (pixel ratio, shadow settings). Exposes a small
API the higher layers use to add objects and to draw one frame. It is the
single place that creates the renderer/composer so it is created once.

> Note: the `EffectComposer` (post) is a separate module (task-13); this task
> creates the bare renderer + camera + scene + one directional "sun" light.
> `post.js` will wrap the renderer's draw with a composer.

## Technical spec

```js
import * as THREE from 'three';
import { QUALITY_TIERS, detectQuality } from '../config/quality.js';

export class Renderer {
  constructor(canvas) {
    this.tier = detectQuality();
    // scene, fog for cinematic depth, background sky color
    // camera: PerspectiveCamera(fov 50, aspect, near .1, far 100)
    //   positioned to look down at the arena (top-down-ish, slight elevation):
    //   camera.position.set(0, GRID_H * 0.9, GRID_H * 0.75); lookAt(0,0,0)
    // renderer: WebGLRenderer({ canvas, antialias: true })
    this.applyQuality(this.tier);
  }
  applyQuality(tierName) {
    const q = QUALITY_TIERS[tierName]; this.tier = tierName;
    // setPixelRatio(q.pixelRatio), shadowMap.enabled = q.shadows.enabled,
    //   shadowMap.type = PCFSoftShadowMap, this.quality = q (store for others)
  }
  setTier(tierName) { this.applyQuality(tierName); }  // called by HUD toggle
  get quality() { return QUALITY_TIERS[this.tier]; }
  add(obj) { this.scene.add(obj); }
  remove(obj){ this.scene.remove(obj); }
  resize() { /* size to canvas.clientWidth/Height, update camera aspect */ }
  render()  { this.renderer.render(this.scene, this.camera); } // superseded by post
}
```

- Create ONE directional light (the "sun"): warm white, castShadow, positioned
  at an angle (e.g. `(8, 20, 6)`), target the arena center. Attach to scene.
  Set its shadow camera bounds to the arena. Also add a low ambient/hemi light
  for base fill.
- `renderer.shadowMap.enabled` and `shadowMap.autoUpdate` default on for
  medium/high; off for low.
- Expose `this.scene`, `this.camera`, `this.renderer`, `this.sun` for other
  modules.

## Acceptance criteria
- `new Renderer(canvas)` produces a scene with a sun, hemi fill, and a camera
  framed on the arena center.
- `setTier('low')` disables shadows + lowers pixel ratio; `setTier('high')`
  enables 2048 shadows + pixel ratio 2.
- Resizing the window keeps aspect correct (camera + renderer update).
- No per-frame allocation in `render()`.
