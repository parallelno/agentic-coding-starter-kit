// Lighting + procedural environment map (R-WORLD-01, R-WORLD-03).
//
// `makeEnvTexture` builds a 2x2 vertical-gradient sky on an injected 2D context
// (mockable in Node) and wraps it in a THREE.CanvasTexture. `lights` installs
// the exact two-light rig. No per-frame allocation: all of this is
// construction-only (R-PERF-04).

import * as THREE from 'three';
import { FLOOR_SIZE } from './materials.js';

const SKY_TOP = 0xbfe4ff;
const SKY_HORIZON = 0xffe9c8;
const HEMI_SKY = 0xbfd9ff;
const HEMI_GROUND = 0x8a7f6a;
const SUN_COLOR = 0xffe6c0;
const SHADOW_PAD = 13;

/**
 * makeEnvTexture(ctx) -> THREE.CanvasTexture.
 *
 * Draws a vertical gradient into ctx: top #bfe4ff -> horizon #ffe9c8 at 55%
 * height, filling a 2x2 (px * 2) canvas. `ctx` is injected so Node tests can
 * supply a mock recording createLinearGradient/fillRect. Returns a
 * THREE.CanvasTexture wrapping `ctx.canvas`.
 */
export function makeEnvTexture(ctx) {
  const w = 2;
  const h = 2;
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, rgb(SKY_TOP));
  grad.addColorStop(0.55, rgb(SKY_HORIZON));
  grad.addColorStop(1, rgb(SKY_HORIZON));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  const tex = new THREE.CanvasTexture(ctx.canvas);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  return tex;
}

/**
 * bakeScene(envTex, pmrem) -> the PMREM-filtered environment texture.
 * R-WORLD-01: scene.environment comes from pmrem.fromEquirectangular.
 */
export function bakeScene(envTex, pmrem) {
  return pmrem.fromEquirectangular(envTex);
}

/**
 * lights(scene, shadowSize) -> { hemi, sun }.
 *
 * Adds exactly (R-WORLD-01):
 *   - HemisphereLight(0xbfd9ff, 0x8a7f6a, 1.0)
 *   - DirectionalLight(0xffe6c0, 2.2) at (12, 18, 8), target (0,0,0),
 *     castShadow = true, ortho shadow camera ±13, near 4 / far 40,
 *     shadow.mapSize = (shadowSize, shadowSize).
 * FLOOR_SIZE is referenced to document that the ±13 camera half-extent
 * comfortably covers the 20-unit arena.
 */
export function lights(scene, shadowSize = 1024) {
  const hemi = new THREE.HemisphereLight(HEMI_SKY, HEMI_GROUND, 1.0);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(SUN_COLOR, 2.2);
  sun.position.set(12, 18, 8);
  sun.target.position.set(0, 0, 0);
  scene.add(sun);
  scene.add(sun.target);
  sun.castShadow = true;
  const sc = sun.shadow.camera;
  sc.left = -SHADOW_PAD;
  sc.right = SHADOW_PAD;
  sc.top = SHADOW_PAD;
  sc.bottom = -SHADOW_PAD;
  sc.near = 4;
  sc.far = 40;
  sc.updateProjectionMatrix();
  sun.shadow.mapSize.set(shadowSize, shadowSize);

  return { hemi, sun };
}

function rgb(hex) {
  return (
    'rgb(' +
    ((hex >> 16) & 0xff) +
    ',' +
    ((hex >> 8) & 0xff) +
    ',' +
    ((hex & 0xff)) +
    ')'
  );
}

// Re-export so world tests can share the arena size with materials.js.
export { FLOOR_SIZE };
