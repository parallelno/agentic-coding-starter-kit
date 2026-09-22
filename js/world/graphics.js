// js/world/graphics.js (T13) — real WebGL scene renderer for the cinematic
// snake. Owns every `three` object: the WebGL renderer, the scene (environment
// map, lights, floor, walls, water), the ambient dust + food-burst particle
// systems, the snake/food visuals, the camera, and the post-processing
// composer. It is created once at boot and driven per-frame by the engine's
// `graphics.render(snapshot)` / `graphics.size(w,h)` calls.
//
// This module lives in the world layer: it imports `three` and sibling
// world modules (+ the T10 camera rig and T09 dust) and NEVER imports the
// engine, input, ui, or providers layers (R-ARCH-01). The engine only talks
// to this through its opaque {size, render} contract (R-ARCH-02).
//
// Quality-driven (R-WORLD-07): `low` disables the post composer; `standard`
// adds SMAA; `high` adds SMAA + a restrained UnrealBloom. The pixel-ratio and
// shadow-map size come from the tier config passed in at construction.
//
// The camera pose is owned by the T10 CameraRig: every render() call feeds
// the engine-driven snapshot to rig.update(...), so the pose/shake stays
// consistent with the simulation within the same frame.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

import { makeEnvTexture, bakeScene, lights } from './environment.js';
import { buildFloor } from './floor.js';
import { buildWalls } from './walls.js';
import Water from './water.js';
import { SnakeVisual } from './snake.js';
import { FoodVisual } from './food.js';
import { createDust, BurstSystem } from './dust.js';

const CAMERA_FOV = 50;
const CAMERA_NEAR = 0.1;
const CAMERA_FAR = 200;
// Restrained bloom (R-WORLD-07): threshold 0.85 so only emissives bloom,
// low intensity so the scene never blows out.
const BLOOM_STRENGTH = 0.4;
const BLOOM_RADIUS = 0.5;
const BLOOM_THRESHOLD = 0.85;

/**
 * createRealGraphics({ canvas, camera, rig, tier })
 *
 * Build the full WebGL renderer + scene once and return the opaque graphics
 * contract the engine consumes:
 *   - size(w, h): resize renderer / composer / camera aspect for any
 *     viewport change.
 *   - render(snapshot): advance every animated module from a fresh engine
 *     snapshot and draw one frame (through the composer when built).
 *
 * The camera and camera rig are passed in (constructed by the caller, e.g.
 * main.js) so the same rig object can be shared and its onEat/onDeath hooks
 * called from input events. `tier` is the T04 quality config.
 */
export function createRealGraphics({ canvas, camera, rig, tier }) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
  });
  // Native screen resolution (R-PERF-01): render at the full device pixel
  // ratio so the buffer matches the physical pixels — no upscaling blur on
  // HiDPI displays. Quality tiers no longer cap resolution; they continue to
  // govern the FX stack (composer/shadows/dust) for performance.
  const dpr = typeof window !== 'undefined' && window.devicePixelRatio ? window.devicePixelRatio : 1;
  renderer.setPixelRatio(dpr);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0xcfe8ff, 0.012);

  // Baked environment map for the PBR materials (R-PERF-01).
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = makeEnvTexture(typeof document !== 'undefined' ? document.createElement('canvas') : null);
  scene.environment = bakeScene(envTex, pmrem);

  // Lights (1 directional + hemi), floor, walls — static scene.
  lights(scene, tier.shadows);
  scene.add(buildFloor(renderer));
  scene.add(buildWalls());

  // Animated modules (owned here, updated every frame in render).
  const water = new Water();
  water.build(scene);
  const dust = createDust(tier.dust);
  dust.attach(scene, tier.dust, 1);
  const burst = new BurstSystem();
  burst.attach(scene);
  const snakeVisual = new SnakeVisual();
  snakeVisual.attach(scene);
  const foodVisual = new FoodVisual();
  foodVisual.attach(scene);

  // Camera is wired to the shared rig.
  if (camera) {
    camera.fov = CAMERA_FOV;
    camera.near = CAMERA_NEAR;
    camera.far = CAMERA_FAR;
    rig.attach(camera);
  }

  // Post-processing composer (R-WORLD-07). No composer on `low`.
  let composer = null;
  let smaaPass = null;
  const hasComposer = typeof tier.composer === 'string' && tier.composer.length > 0;
  if (hasComposer) {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    if (tier.composer === 'smaa' || tier.composer === 'smaa+bloom') {
      smaaPass = new SMAAPass(1, 1);
      composer.addPass(smaaPass);
    }
    if (tier.composer === 'smaa+bloom') {
      const bloom = new UnrealBloomPass(
        new THREE.Vector2(1, 1),
        BLOOM_STRENGTH,
        BLOOM_RADIUS,
        BLOOM_THRESHOLD
      );
      composer.addPass(bloom);
    }
    composer.addPass(new OutputPass());
  }

  // Per-frame state: last render time and the moment the scene entered the
  // `dead` state (to compute tSinceDeathSec for the cinematic death dolly).
  let lastNow = typeof performance !== 'undefined' ? performance.now() : 0;
  let deathNowMs = null;

  function resize(w, h) {
    if (w > 0 && h > 0) {
      renderer.setSize(w, h, false);
      if (camera) {
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      }
      if (composer) composer.setSize(w, h);
      if (smaaPass) smaaPass.setSize(Math.floor(w), Math.floor(h));
    }
  }

  // Start at the live window size if available.
  resize(canvas.width || 960, canvas.height || 540);

  function render(snapshot) {
    const now = typeof performance !== 'undefined' ? performance.now() : lastNow;
    // Clamp a big gap (tab was hidden) so dtSec stays sane (R-PERF-03).
    const dtMs = Math.max(0, Math.min(100, now - lastNow));
    lastNow = now;
    const dtSec = dtMs / 1000;
    const t = now / 1000; // seconds since boot (ambient phase)

    // Track the moment the scene entered `dead` so the cinematic death dolly
    // has a correct tSinceDeathSec; clear it when play resumes.
    if (snapshot.state === 'dead') {
      if (deathNowMs === null) deathNowMs = now;
    } else {
      deathNowMs = null;
    }
    const tSinceDeath = deathNowMs === null ? 0 : (now - deathNowMs) / 1000;

    // Camera pose + shake from the shared rig (consistent within the frame).
    // `rig.update` writes camera.position and rig.lookTarget; we must apply the
    // orientation here (R-CINE-01 / R-WORLD-08) or the pose stays forward-fixed.
    rig.update(dtMs, snapshot, t, tSinceDeath, now);
    camera.lookAt(rig.lookTarget);

    // Advance each animated module by one frame.
    snakeVisual.update(snapshot);
    foodVisual.update(snapshot, t);
    water.updateWater(t);
    dust.updateDust(dtSec);
    burst.updateBurst(dtSec);

    if (composer) composer.render();
    else renderer.render(scene, camera);
  }

  return {
    canvas,
    renderer,
    scene,
    camera,
    rig,
    dust,
    burst,
    size: resize,
    render,
  };
}

export default { createRealGraphics };
