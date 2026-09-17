// js/world/environment.js — sky environment map + exact two-light rig
// (T06, R-WORLD-01). Construction part; `three` imported at top level.
// No per-frame methods (R-PERF-04): bake once at boot, lights added once.
import * as THREE from 'three';

// 2x2 vertical gradient sky (R-WORLD-01): top -> horizon.
export const SKY_TOP = 0xbfd9ff;
export const SKY_HORIZON = 0xffe9c8;

function toCtx(input) {
  if (input && typeof input.createLinearGradient === 'function') return input;
  if (input && typeof input.getContext === 'function') return input.getContext('2d');
  throw new Error('makeEnvTexture: inject a 2D canvas or its 2D context');
}

/**
 * makeEnvTexture(canvasOrCtx) -> THREE.CanvasTexture
 * Fills an injected 2D context (mockable in Node) with the 2x2 vertical
 * gradient sky, then wraps the canvas in a CanvasTexture mapped as
 * equirectangular so `pmrem.fromEquirectangular` accepts it.
 */
export function makeEnvTexture(canvasOrCtx) {
  const ctx = toCtx(canvasOrCtx);
  const grad = ctx.createLinearGradient(0, 0, 0, 2);
  grad.addColorStop(0, '#bfe4ff');
  grad.addColorStop(1, '#ffe9c8');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 2, 2);
  const canvas =
    canvasOrCtx && typeof canvasOrCtx.getContext === 'function'
      ? canvasOrCtx
      : ctx.canvas;
  const tex = new THREE.CanvasTexture(canvas);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  return tex;
}

/**
 * bakeScene(envTex, pmrem) -> THREE.Texture
 * R-WORLD-01: prefiltered environment map from the equirectangular sky.
 */
export function bakeScene(envTex, pmrem) {
  return pmrem.fromEquirectangular(envTex).texture;
}

/**
 * lights(scene, shadowSize) -> { hemi, sun }
 * Adds EXACTLY the R-WORLD-01 rig:
 *   HemisphereLight(0xbfd9ff, 0x8a7f6a, 1.0)
 *   DirectionalLight(0xffe6c0, 2.2) at (12, 18, 8), target (0, 0, 0),
 *   castShadow, ortho shadow camera ±13, near 4, far 40,
 *   shadow.mapSize (shadowSize, shadowSize).
 */
export function lights(scene, shadowSize) {
  const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x8a7f6a, 1.0);

  const sun = new THREE.DirectionalLight(0xffe6c0, 2.2);
  sun.position.set(12, 18, 8);
  sun.castShadow = true;
  sun.shadow.camera.left = -13;
  sun.shadow.camera.right = 13;
  sun.shadow.camera.top = 13;
  sun.shadow.camera.bottom = -13;
  sun.shadow.camera.near = 4;
  sun.shadow.camera.far = 40;
  sun.shadow.mapSize.set(shadowSize, shadowSize);
  sun.target.position.set(0, 0, 0);

  scene.add(hemi, sun, sun.target);
  return { hemi, sun };
}
