# Task 13 — Post-Processing (filmic grade)

- **Wave:** 3
- **Files to create:** `js/post/post.js`
- **Depends on:** `js/renderer/renderer.js` (W2, gives `renderer` / scene /
  camera), `js/config/quality.js` (W1). Uses Three.js addons.

## Description

The filmic post grade: `EffectComposer` with bloom, a vignette, tone-mapping,
and a subtle color grade/letterbox to sell the "cinematic" look. The composer
replaces the plain `renderer.render(...)` call as the draw entry point that the
integration task uses. All effects scale by tier (see `post` flags in
`quality.js`). No external assets.

## Technical spec

```js
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass }     from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass }from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass }     from 'three/addons/postprocessing/OutputPass.js';
// Vignette: either a custom ShaderPass (write a small ShaderMaterial) or
//   ShaderPass + a minimal vignette shader string defined inline.

export class Post {
  constructor(renderer) {          // renderer is the Renderer (task-04 instance)
    this.renderer = renderer;
    this.build();
  }
  build() {
    const r = this.renderer.renderer; // the raw THREE.WebGLRenderer
    this.composer = new EffectComposer(r);
    this.composer.addPass(new RenderPass(this.renderer.scene, this.renderer.camera));
    if (this.renderer.quality.post.bloom) {
      this.bloom = new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        0.6 /*strength*/, 0.4 /*radius*/, 0.75 /*threshold*/);
      this.composer.addPass(this.bloom);
    }
    // vignette + grade as a ShaderPass (inline shader: edges darken, slight
    //    warm-up of highlights / cool of shadows, optional anamorphic streaks)
    // OutputPass for correct tonemapping/sRGB on modern three
    this.composer.addPass(new OutputPass());
  }
  setSize(w, h) { this.composer.setSize(w, h); }
  setQuality(name) { this.q = this.renderer.quality; /* rebuild passes to
                    // include/exclude bloom based on tier */ }
  render() { this.composer.render(); }
}
```

- `three@0.160.0`: `OutputPass` handles tone-mapping + sRGB. If you set
  `renderer.toneMapping = THREE.ACESFilmicToneMapping` in the Renderer, ensure
  `OutputPass` is the final pass so grading is applied after tonemap.
- Bloom threshold ~0.75 so only bright speculars (water highlights, dust) bloom.
- Vignette/grade shader: a compact inline `THREE.ShaderMaterial` full-screen
  quad — `uv`-based corner darkening (radius) + a split-tone (lift shadows cool,
  warm highlights). Keep it to a few lines of GLSL; no textures.
- Respect `post.bloom`/`post.vignette`/`post.tonemap` flags; on `low`, skip
  bloom (and optionally reduce vignette intensity).

## Acceptance criteria
- `Post.render()` draws the scene through the composer; toggling bloom visibly
  increases highlight glow from water/dust at medium/high.
- Edges are darkened (vignette) and the image has a graded feel vs. raw
  `renderer.render()`; on `low`, bloom is absent.
- `setSize(w,h)` keeps the composer in sync after window resize.
- No external texture URLs; the grade shader is inline.
