// Task 13 — Post-processing.
//
// Builds a THREE.EffectComposer chain:
//   RenderPass -> (Vignette + ACES approx tone-map) -> UnrealBloomPass (quality-toggled) -> FXAA
//
// This module is the ONLY one (besides renderer.js) that touches Three.js
// post-processing addons. No external textures are used.
//
// Three.js is provided by the CDN import-map:
//   'three'          -> pinned three@0.160.0
//   'three/addons/..' -> the matching addons build
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { QUALITY_TIERS } from '../config/quality.js';

// A single small inline shader that does vignette + a mild ACES filmic fit.
// (Not from three/addons — authored here, no external textures.)
const VignetteShader = {
  name: 'VignetteShader',
  uniforms: {
    tDiffuse: { value: null },
    strength: { value: 0.45 },
    radius: { value: 0.9 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float strength;
    uniform float radius;
    varying vec2 vUv;

    void main() {
      vec4 col = texture2D(tDiffuse, vUv);
      vec3 rgb = col.rgb;

      // --- ACES filmic approx (Narkowicz single-curve fit) ---
      // renderer.js already applies THREE.ACESFilmicToneMapping at the source;
      // this is a mild additive pass so keep it restrained (blend a fraction in).
      vec3 acesFit = rgb * (rgb + 0.024709)
                    / (rgb * (rgb * 0.0319486 + 0.503891) + 0.25);
      rgb = mix(rgb, acesFit, 0.5);

      // --- Vignette ---
      vec2 pc = vUv - 0.5;
      float d = length(pc) * 1.4142;              // normalize to ~1 at corners
      float vig = smoothstep(radius * 1.25, radius, d);
      rgb *= 1.0 - vig * strength;

      gl_FragColor = vec4(rgb, col.a);
    }
  `,
};

export class Post {
  constructor(renderer, scene, camera) {
    this.renderer = renderer; // THREE.WebGLRenderer
    this.scene = scene;
    this.camera = camera;
    this.composer = new EffectComposer(renderer);
    this.bloomPass = null;
    this.vignettePass = null;
    this.fxaaPass = null;
    this.build();
  }

  build() {
    const w = this.renderer.domElement?.width || window.innerWidth;
    const h = this.renderer.domElement?.height || window.innerHeight;

    // 1. Scene render pass.
    this.composer.addPass(new RenderPass(this.scene, this.camera));

    // 2. Vignette + ACES approx tonemap (always on).
    this.vignettePass = new ShaderPass(VignetteShader);
    this.vignettePass.enabled = true;
    this.composer.addPass(this.vignettePass);

    // 3. Bloom (toggled by setQuality; constructed disabled).
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(w, h), 0.6, 0.4, 0.75);
    this.bloomPass.enabled = false;
    this.composer.addPass(this.bloomPass);

    // 4. FXAA last (antialiasing after post).
    this.fxaaPass = new ShaderPass(FXAAShader);
    this._setFxaaRes(w, h);
    this.composer.addPass(this.fxaaPass);
  }

  _setFxaaRes(w, h) {
    if (!this.fxaaPass) return;
    const pr = this.renderer.getPixelRatio();
    this.fxaaPass.material.uniforms.resolution.value.set(1 / (w * pr), 1 / (h * pr));
  }

  setSize(w, h) {
    this.composer.setSize(w, h);
    this._setFxaaRes(w, h);
  }

  setQuality(name) {
    const q = QUALITY_TIERS[name];
    this.bloomPass.enabled = !!q?.post?.bloom;
    this.vignettePass.enabled = true; // always on
  }

  render() {
    this.composer.render();
  }

  dispose() {
    if (this.vignettePass && this.vignettePass.dispose) this.vignettePass.dispose();
    if (this.bloomPass && this.bloomPass.dispose) this.bloomPass.dispose();
    if (this.fxaaPass && this.fxaaPass.dispose) this.fxaaPass.dispose();
    if (this.composer.dispose) this.composer.dispose();
  }
}
