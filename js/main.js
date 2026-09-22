// Bootstrap: renderer, scene, lights, environment, camera/controls, frame loop, debug hook.
// Later waves plug the cloth view, interactions and water into the loop body below; the
// structure (dt clamp, substep accumulator, modes) is fixed here per C3/R7/R8.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ClothSim } from './core/cloth.js';
import { ClothView } from './world/cloth.js';
import { Grab } from './interact/grab.js';
import { tearPass } from './interact/tear.js';
import { WaterHose } from './world/water.js';
import { updateWetnessColors } from './world/wetness.js';
import {
  CAM_FAR,
  CAM_FOV,
  CAM_NEAR,
  CAM_POS,
  CAM_TARGET,
  DT_CLAMP,
  DT_SUB,
  DT_SUB_MAX,
  FLOOR_COLOR,
  FLOOR_SIZE,
  POLAR_MAX,
  SKY_COLOR,
  ZOOM_MAX,
  ZOOM_MIN,
} from './config.js';

const app = document.getElementById('app');
const hint = document.getElementById('hint');

// --- Renderer ---
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
app.appendChild(renderer.domElement);

// --- Scene / environment (R1) ---
const scene = new THREE.Scene();
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(60, 32, 16),
  new THREE.MeshBasicMaterial({ color: SKY_COLOR, side: THREE.BackSide, depthWrite: false }),
);
sky.name = 'skydome';
scene.add(sky);

// Lighting: three.js r155+ uses physically-correct units (irradiance in lux, diffuse = albedo/PI),
// so a white sheet needs intensities around 2-3 to actually read as white (R1). Measured with
// 0.9/1.1 the sheet rendered at ~140/255 grey, darker than the skydome.
const hemi = new THREE.HemisphereLight(0xffffff, 0x445064, 2.2);
scene.add(hemi);
const key = new THREE.DirectionalLight(0xffffff, 2.6);
key.position.set(3, 5, 2);
scene.add(key);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(FLOOR_SIZE, FLOOR_SIZE),
  new THREE.MeshStandardMaterial({ color: FLOOR_COLOR, roughness: 1 }),
);
floor.rotation.x = -Math.PI / 2;
floor.name = 'floor';
scene.add(floor);

// --- Cloth (sim + view) ---
const sim = new ClothSim();
const clothView = new ClothView(sim);
clothView.setColorUpdater(updateWetnessColors); // wet -> color lerp (R6/C4)
scene.add(clothView.mesh);

// --- Camera / controls (R7) ---
const camera = new THREE.PerspectiveCamera(CAM_FOV, window.innerWidth / window.innerHeight, CAM_NEAR, CAM_FAR);
camera.position.set(CAM_POS[0], CAM_POS[1], CAM_POS[2]);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.target.set(CAM_TARGET[0], CAM_TARGET[1], CAM_TARGET[2]);
controls.minDistance = ZOOM_MIN;
controls.maxDistance = ZOOM_MAX;
controls.maxPolarAngle = POLAR_MAX;
controls.update();

// --- Grab interaction (R8 grab mode) ---
const grab = new Grab(renderer.domElement, camera, sim, clothView.mesh, controls);

// Per-substep water-impulse magnitudes handed to tearPass. WaterHose.update() drains the sim's
// impulse buffer and divides by the substeps run that frame, so tearPass receives per-substep
// values (documented Task 06 hand-off). Pull-only tearing passes null.
let waterImpulsePerSubstep = null;

// --- Water hose (R5) ---
const water = new WaterHose(camera, sim, scene);
waterImpulsePerSubstep = water.impulseMagnitudes;

// --- Input mode skeleton (R8) ---
const state = {
  mode: 'grab', // 'grab' | 'hose'
  simTime: 0,
};

function applyMode() {
  renderer.domElement.style.cursor = state.mode === 'grab' ? 'grab' : 'crosshair';
}

window.addEventListener('keydown', (event) => {
  if (event.repeat) return;
  if (event.key === 'h' || event.key === 'H') {
    state.mode = state.mode === 'grab' ? 'hose' : 'grab';
    grab.setModeEnabled(state.mode === 'grab');
    if (state.mode !== 'hose') water.setActive(false);
    applyMode();
  }
});

// Hose: LMB held in hose mode sprays (R8). Released/cancelled anywhere stops it.
renderer.domElement.addEventListener('pointerdown', (event) => {
  if (state.mode === 'hose' && event.button === 0) water.setActive(true);
});
for (const type of ['pointerup', 'pointercancel', 'pointerleave']) {
  window.addEventListener(type, () => water.setActive(false));
}

// --- Frame loop (C3) ---
let lastFrame = performance.now();
let simAcc = 0;
let pendingShot = null; // { name, resolve } — capture happens inside the frame, right after render

function frame(now) {
  const dt = Math.min(Math.max((now - lastFrame) / 1000, 0), DT_CLAMP);
  lastFrame = now;

  controls.update();

  simAcc += dt;
  let substeps = 0;
  while (simAcc >= DT_SUB && substeps < DT_SUB_MAX) {
    sim.step(DT_SUB);
    // Tear check runs once per substep, after step(), so a tear takes effect next substep (R4).
    tearPass(sim, waterImpulsePerSubstep);
    simAcc -= DT_SUB;
    substeps++;
  }
  if (simAcc > DT_SUB) simAcc = 0; // dropped excess (death-spiral guard)

  // View sync (positions, colors, normals) happens after the substeps (C3).
  grab.update();
  clothView.sync();
  // Water runs on the render delta (not the sim substep) so the spray rate stays stable (C3).
  water.update(dt, substeps);
  state.simTime += substeps * DT_SUB;

  renderer.render(scene, camera);

  // `P` / __dbg.saveScreenshot capture must happen in the same task as the draw: without
  // preserveDrawingBuffer the canvas is cleared once the frame is composited (an out-of-frame
  // toDataURL returns a black image).
  if (pendingShot) {
    const { name, resolve } = pendingShot;
    pendingShot = null;
    captureAndSave(name).then(resolve);
  }

  requestAnimationFrame(frame);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

applyMode();
if (hint) hint.style.display = 'block';
requestAnimationFrame(frame);

// --- Debug hook (only with ?debug=1) ---
const DEBUG = new URLSearchParams(window.location.search).has('debug');
if (DEBUG) {
  window.__dbg = {
    sim,
    clothView,
    grab,
    water,
    scene,
    camera,
    controls,
    renderer,
    saveScreenshot,
    state() {
      return { mode: state.mode, tornCount: sim.tornCount, wetMax: sim.wetMax, simTime: state.simTime };
    },
  };
}

async function saveScreenshot(name = 'cloth.png') {
  // Schedules the capture for the next rendered frame and resolves with the POST /save result.
  // Safe to call from outside the frame loop (debug hook, key handler, automation).
  return new Promise((resolve) => {
    pendingShot = { name, resolve };
  });
}

async function captureAndSave(name) {
  try {
    const dataUrl = renderer.domElement.toDataURL('image/png');
    const response = await fetch('/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file: name, dataUrl }),
    });
    const result = await response.json();
    console.log('screenshot saved', result);
    return result;
  } catch (err) {
    console.error('screenshot failed', err);
    return { error: String(err) };
  }
}

window.addEventListener('keydown', (event) => {
  if (!DEBUG || event.repeat) return;
  if (event.key === 'p' || event.key === 'P') {
    // Default name is cloth.png; `?shot=<name>` (or __dbg.saveScreenshot(name)) selects another,
    // which the final gate uses for the cloth_01..cloth_05 stage captures.
    saveScreenshot(new URLSearchParams(window.location.search).get('shot') || 'cloth.png');
  }
});

