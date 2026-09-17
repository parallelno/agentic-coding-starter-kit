// SNAKE — Cinematic Edition: real graphics backend (browser only).
// Composition of the world visuals + post-processing for one quality tier.
// Returns the opaque `{ size(w,h), render(snapshot) }` shape the engine
// expects and nothing else — the engine never reaches into world internals
// (R-ARCH-01). Browser only: touches document/canvas/context, so it is never
// imported from Node tests (which use a mock graphics object instead).

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { buildFloor } from './floor.js';
import { buildWalls } from './walls.js';
import { buildWater, updateWater } from './water.js';
import { createDustSystem, createBurstSystem, makeBlobSprite } from './dust.js';
import { createSnakeVisual } from './snake.js';
import { createFoodVisual } from './food.js';
import { makeEnvTexture, bakeScene, lights } from './environment.js';
import { createCameraRig } from './camera.js';

// Bloom pass constants (T13 contract: 0.85 threshold, 0.4 intensity).
const BLOOM_STRENGTH = 0.4;
const BLOOM_RADIUS = 0.5;
const BLOOM_THRESHOLD = 0.85;

// Build the post stack for a tier's composer key. `false` -> null (low tier),
// 'smaa' -> Render/SMAA/Output, 'smaa+bloom' adds the bloom pass before Output.
function buildComposer(renderer, scene, camera, composerKey, w, h) {
  if (!composerKey) return null;
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  if (composerKey === 'smaa') {
    composer.addPass(new SMAAPass(w, h));
  } else if (composerKey === 'smaa+bloom') {
    composer.addPass(new SMAAPass(w, h));
    composer.addPass(
      new UnrealBloomPass(new THREE.Vector2(w, h), BLOOM_STRENGTH, BLOOM_RADIUS, BLOOM_THRESHOLD)
    );
  }
  composer.addPass(new OutputPass());
  return composer;
}

// createRealGraphics({ canvas, tier }) — tier is tierConfig(quality).
// Builds the renderer, scene, all visuals, and the camera rig once; `size`
// re-tunes sizes on resize and `render` advances the animation for one frame.
export function createRealGraphics({ canvas, tier }) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(tier.pixelRatio);
  renderer.setClearColor(0x87a6c4, 1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
  camera.position.set(0, 12, 14);
  camera.lookAt(0, 0, 0);

  // Environment map (R-WORLD-07): 2x2 equirect gradient baked through PMREM.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envCanvas = document.createElement('canvas');
  envCanvas.width = 2;
  envCanvas.height = 2;
  const envTex = makeEnvTexture(envCanvas.getContext('2d'));
  scene.environment = bakeScene(envTex, pmrem).texture;

  // Static world, built once.
  scene.add(buildFloor());
  scene.add(buildWalls());
  const water = buildWater(scene);
  const blob = makeBlobSprite();
  const dust = createDustSystem().attach(scene, tier.dust, 1337, blob);
  const burst = createBurstSystem().attach(scene);
  const snake = createSnakeVisual();
  snake.attach(scene, renderer);
  const food = createFoodVisual();
  food.attach(scene);
  lights(scene, tier.shadows);

  // The cinematic camera rig writes into `camera` each frame.
  const rig = createCameraRig(() => performance.now());
  rig.attach(camera);

  // Composer is created lazily once we first have a real size (draw buffer =
  // CSS px * pixelRatio), then resized in place on every `size` call.
  let composer = null;
  let lastW = 0;
  let lastH = 0;
  // Animation accumulators (no per-frame allocation, R-PERF-04). `t` is wall-
  // clock animation time only — the engine's own fixed-step governs gameplay.
  let t = 0;
  let deathAt = 0;
  let lastState = 'menu';
  let lastWall = 0;

  function refreshComposer() {
    const bw = Math.max(1, Math.floor(lastW * tier.pixelRatio));
    const bh = Math.max(1, Math.floor(lastH * tier.pixelRatio));
    if (composer) {
      composer.setSize(bw, bh);
    } else if (tier.composer) {
      composer = buildComposer(renderer, scene, camera, tier.composer, bw, bh);
    }
  }

  return {
    renderer,
    rig,
    burst,
    size(w, h) {
      if (w) lastW = w;
      if (h) lastH = h;
      // The engine probes size(0,0) at boot; don't shrink the real canvas.
      if (!lastW || !lastH) return;
      renderer.setSize(lastW, lastH);
      camera.aspect = lastW / lastH;
      camera.updateProjectionMatrix();
      refreshComposer();
    },
    render(snapshot) {
      const nowWall = performance.now();
      const dtMs = Math.min(100, Math.max(0, nowWall - lastWall));
      lastWall = nowWall;
      const dtSec = dtMs / 1000;
      t += dtSec;

      // tSinceDeath is derived straight from the snapshot's death state so no
      // external bookkeeping is needed.
      if (snapshot.state === 'dead') {
        if (lastState !== 'dead') deathAt = t;
      } else if (lastState === 'dead') {
        deathAt = 0;
      }
      lastState = snapshot.state;
      const tSinceDeathSec = snapshot.state === 'dead' ? t - deathAt : 0;

      // Advance every visual (all allocation-free after attach()).
      snake.update(snapshot);
      food.update(snapshot, t);
      updateWater(water, t);
      dust.updateDust(dtSec);
      burst.updateBurst(dtSec);

      rig.update(dtMs, snapshot, t, tSinceDeathSec, nowWall);
      camera.lookAt(rig.lookTarget);

      if (composer) composer.render();
      else renderer.render(scene, camera);
    },
    dispose() {
      pmrem.dispose();
      renderer.dispose();
    },
  };
}
