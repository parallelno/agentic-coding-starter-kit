import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

import { GRID, STEP_MS } from './config.js';
import { Game, cellToWorld } from './core/game.js';
import { Loop } from './core/loop.js';
import { Events, EVT } from './core/events.js';
import { bindInput } from './core/input.js';
import { buildArena } from './world/arena.js';
import { SnakeView, AppleView } from './world/snake.js';
import { Shake } from './cam/shake.js';

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('scene'));
const scoreEl = /** @type {HTMLDivElement} */ (document.getElementById('score'));

const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fc4e8); // placeholder sky (real env bg in M3)

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 300);

/* Lights (placeholder — cinematic rig in M3) */
const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x6b5d4f, 1.1);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff2dd, 2.2);
sun.position.set(18, 26, 12);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -20; sun.shadow.camera.right = 20;
sun.shadow.camera.top = 20;   sun.shadow.camera.bottom = -20;
sun.shadow.camera.near = 5;   sun.shadow.camera.far = 80;
sun.shadow.bias = -0.0004;
scene.add(sun, sun.target);

/* Environment map (MIT HDRI from the three.js repo, vendored in assets/) */
new RGBELoader().load('assets/venice_sunset_1k.hdr', (hdr) => {
  hdr.mapping = THREE.EquirectangularReflectionMapping;
  scene.environment = hdr.texture;
});

/* ------------------------------------------------------------------ */
/* World + game                                                        */
/* ------------------------------------------------------------------ */

buildArena(scene);

const events = new Events();
const game = new Game(events);
const snakeView = new SnakeView(scene);
const appleView = new AppleView(scene);
const shake = new Shake(camera, events);

/* Top-down follow camera (proper follow language in M5) */
const camTarget = new THREE.Vector3(0, 16, 14);

let scoreLabel = '0';

events.on(EVT.COLLECT, ({ score }) => {
  scoreLabel = String(score);
  scoreEl.textContent = scoreLabel;
});
events.on(EVT.DIE, (info) => { scoreEl.textContent = `Died (${info.cause}) — ${game.score}`; });

/* Death overlay (placeholder — real popup in M8) */
function showDeath(text) {
  let el = document.getElementById('death-note');
  if (!el) {
    el = document.createElement('div');
    el.id = 'death-note';
    el.style.cssText = 'position:fixed;inset:0;display:grid;place-items:center;z-index:20;pointer-events:none;' +
      'font:600 28px/1.3 system-ui,sans-serif;color:#fff;text-align:center;text-shadow:0 2px 12px rgba(0,0,0,.8)';
    document.body.appendChild(el);
  }
  el.innerHTML = text;
}
events.on(EVT.DIE, ({ score, cause }) => {
  const why = { pond: 'the pond claimed you', self: 'you bit yourself' }[cause] ?? 'you hit a wall';
  showDeath(`<div>SNAKE — ${why}<br>${score} pts · press R to restart</div>`);
});

function restart() {
  game.reset();
  scoreEl.textContent = '0';
  document.getElementById('death-note')?.remove();
  snakeView.reset(); // visual positions re-snap to logical cells
}

/* ------------------------------------------------------------------ */
/* Loop                                                                */
/* ------------------------------------------------------------------ */

const loop = new Loop({ stepMs: STEP_MS, onStep: () => game.step() });
loop.start((dt) => {
  if (game.alive) {
    /* Logic: advance by speed multiplier (>=1 after eating). */
    loop.advance(dt, game.speedNorm);
    appleView.update(game.appleCell);
  }

  /* Interpolated head (fixed-step → render interpolation):
     constant velocity, no per-step ease-out "surge and settle". */
  const prevW = cellToWorld(game.prevSnake[0]);
  const curW = cellToWorld(game.snake[0]);
  const a = game.alive ? loop.alpha : 1;
  const headX = prevW.x + (curW.x - prevW.x) * a;
  const headZ = prevW.z + (curW.z - prevW.z) * a;
  snakeView.update(game.prevSnake, game.snake, a);

  /* Camera: top-down follow (proper language in M5). The follow target and
     the lookAt point are BOTH driven from the interpolated head, so the aim
     never re-snaps to a discrete cell mid-step. */
  const y = 14 + game.snake.length * 0.06;
  const k = 1 - Math.exp(-5 * dt);
  camTarget.x += (headX - camTarget.x) * k;
  camTarget.z += (headZ + 11 - camTarget.z) * k;
  camTarget.y += (y - camTarget.y) * k;
  camera.position.copy(camTarget);
  camera.lookAt(headX, 0, headZ);

  /* Sun tracks the action so shadows stay inside the frustum. */
  sun.position.set(headX + 18, 26, headZ + 12);
  sun.target.position.set(headX, 0, headZ);

  /* Camera-shake contribution (damped impulse; identity at rest). */
  shake.update(dt);

  renderer.render(scene, camera);

  /* Screenshot is taken right after render while the GL buffer is fresh. */
  if (screenshot) {
    const name = screenshot;
    screenshot = null;
    const b64 = renderer.domElement.toDataURL('image/png').split(',')[1];
    fetch(`/save?name=${encodeURIComponent(name)}&enc=b64`, { method: 'POST', body: b64 });
  }
});

/* Input: game controls + restart + screenshot (P) */
let screenshot = null; // pending capture name; resolved right after a render
bindInput(game, restart, events);
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyP') screenshot = window.__shotName || 'snake_capt.png';
});

/* TEMP — debug/verification handle for browser-side instrumentation. */
window.__three = { camera, scene, renderer, game, snakeView, appleView, shake, loop };

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();