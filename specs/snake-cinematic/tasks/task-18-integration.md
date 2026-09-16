# Task 18 — Integration (index.html + main.js)

- **Wave:** 6
- **Files to create:** `index.html`, `js/main.js`
- **Depends on:** every other task (W1–W5). Specifically:
  - `js/config/constants.js`, `js/config/quality.js` (W1)
  - `js/util/eventBus.js` (W1)
  - `js/game/grid.js`, `js/game/input.js`, `js/game/snake.js`, `js/game/food.js`, `js/game/state.js` (W2–W5)
  - `js/renderer/renderer.js`, `js/renderer/arena.js`, `js/renderer/water.js`,
    `js/renderer/dust.js`, `js/renderer/snakeMesh.js` (W2, W3)
  - `js/post/post.js`, `js/camera/camera.js` (W3)
  - `js/audio/audio.js`, `js/ui/leaderboard.js`, `js/ui/hud.js` (W2, W3)

## Description

The final, single entry point. `index.html` is a **thin shell** (no logic): it
hosts the `<canvas>`, the HUD/overlay DOM nodes, a CSS style block (enough for
a full-viewport canvas + readable overlay), and the Three.js import-map. It
boots with `<script type="module" src="js/main.js"></script>`.

`js/main.js` **wires every module together** and owns the RAF loop. It is the
only module that constructs the graph. Specifically it:

1. Constructs `Renderer`, then `Post` (which wraps the renderer's draw).
2. Builds `Arena`, `Water`, `Dust`, `SnakeMesh`, `GameCamera`, `Food` visual,
   `Audio`, `Input`, `GameState`, `Hud`.
3. Subscribes to bus events it must react to (quality change → renderer/post/
   dust; `state` → food visual visibility).
4. Runs the RAF loop: `state.tick(dt)`, `camera.setTarget(state.headWorld)`,
   `camera.update`, `snakeMesh.setBody(state.snake.body)`, `snakeMesh.update`,
   `water.update`, `dust.update`, `post.setSize` (if changed) + `post.render()`.
5. Handles window `resize` by calling `renderer.resize()` + `post.setSize()`.
6. Wires `Hud.setActionsHandler` to drive `state` (start/pause), and
   `Hud.onQualityChange` to drive tier switching across renderer/post/dust.
7. On `GAME_OVER`, calls `hud.saveScore(score, name)`.

This task is the **only** file that imports everything. Every other module has
imports of ≤2 other modules by design.

## Technical spec

### `index.html`

Structural skeleton (exact content below):

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Snake — Cinematic</title>
  <style>
    html, body { margin: 0; height: 100%; background: #0b0d10; color: #eee;
                 font: 16px/1.4 system-ui, sans-serif; overflow: hidden; }
    #stage { position: fixed; inset: 0; }
    #stage canvas { display: block; width: 100%; height: 100%;
                    touch-action: none; }
    #hud { position: fixed; top: 12px; left: 12px; display: flex; gap: 12px;
           align-items: center; font-variant-numeric: tabular-nums;
           text-shadow: 0 1px 2px #000; pointer-events: none; }
    #hud .stat b { margin-right: 4px; opacity: 0.7; font-weight: 500; }
    #quality { display: flex; gap: 4px; pointer-events: auto; }
    #quality button { background: #1c2024; color: #ccc; border: 1px solid
                      #333; cursor: pointer; padding: 2px 8px; }
    #quality button.active { background: #333; color: #fff; }
    #overlay { position: fixed; inset: 0; display: flex; flex-direction: column;
               align-items: center; justify-content: center; gap: 8px;
               background: rgba(0,0,0,.55); backdrop-filter: blur(3px);
               text-align: center; pointer-events: auto; }
    #overlay[hidden] { display: none; }
    #overlay-title { font-size: 42px; letter-spacing: .06em; }
    #overlay-msg { opacity: .85; max-width: 46ch; }
    #overlay-action { margin-top: 12px; padding: 8px 18px; background: #222c33;
                      border: 1px solid #445; border-radius: 4px; }
    #overlay-board { margin-top: 18px; width: min(420px, 90vw);
                     font-variant-numeric: tabular-nums; }
    #overlay-board table { width: 100%; border-collapse: collapse; }
    #overlay-board td, #overlay-board th { padding: 4px 8px;
                                           border-bottom: 1px solid #2a2f36; }
  </style>
  <script type="importmap">
  { "imports": {
      "three":         "https://unpkg.com/three@0.160.0/build/three.module.js",
      "three/addons/": "https://unpkg.com/three@0.160.0/examples/jsm/"
  } }
  </script>
  <script>
    // Plain (non-module) guard: ES modules + importmap require http(s)://,
    // not file://. Show a clear message instead of a silent blank page.
    if (location.protocol === 'file:') {
      document.body.innerHTML =
        '<div style="display:grid;place-items:center;height:100vh;text-align:center;padding:24px">'
        + '<h2>Serve over HTTP</h2>'
        + '<p>This app uses ES modules + an import map, which browsers only load '
        + 'over <code>http(s)://</code>, not <code>file://</code>.</p>'
        + '<p>Run a static server in this folder, e.g. <code>python -m http.server</code>, '
        + 'then open <code>http://localhost:8000/</code>.</p></div>';
    }
  </script>
</head>
<body>
  <div id="stage"><canvas id="gl"></canvas></div>

  <div id="hud">
    <div class="stat"><b>SCORE</b><span id="score">0</span></div>
    <div class="stat"><b>SPEED</b><span id="speed">1.0×</span></div>
    <div id="quality" aria-label="quality">
      <button data-tier="low">Low</button>
      <button data-tier="medium">Med</button>
      <button data-tier="high">High</button>
    </div>
  </div>

  <div id="overlay">
    <div id="overlay-title">SNAKE</div>
    <div id="overlay-msg">Arrows/WASD to steer · Space to pause · Enter to start</div>
    <div id="overlay-action">Press to start</div>
    <div id="overlay-board" hidden></div>
  </div>

  <script type="module" src="js/main.js"></script>
</body>
</html>
```

Notes:
- All the DOM ids listed in task-14 (`#score`, `#speed`, `#quality`,
  `#overlay`, `#overlay-title`, `#overlay-msg`, `#overlay-action`,
  `#overlay-board`) are present and match. Quality is a group of
  `<button data-tier="…">` (task-14's "or a `#quality` select" permits this).
- The canvas has `touch-action: none` (required by task-07 swipe input).
- The overlay starts visible (state `READY`); task-14's `#renderState('RUNNING')`
  hides it via `hidden` attribute.
- Three.js import-map is pinned to `0.160.0` on `unpkg.com` (see
  requirements.md §Decisions).

### `js/main.js`

```js
// Thin bootstrap + RAF loop. No gameplay logic — only wiring.
import { Renderer }                 from './renderer/renderer.js';
import { createArena }              from './renderer/arena.js';
import { Water }                    from './renderer/water.js';
import { Dust }                     from './renderer/dust.js';
import { SnakeMesh }                from './renderer/snakeMesh.js';
import { Post }                     from './post/post.js';
import { GameCamera }               from './camera/camera.js';
import { Input }                    from './game/input.js';
import { GameState }                from './game/state.js';
import { Audio }                    from './audio/audio.js';
import { Hud }                      from './ui/hud.js';
import { bus }                      from './util/eventBus.js';
import { toWorld }                  from './game/grid.js';
import * as THREE                   from 'three';

const canvas = document.getElementById('gl');

// --- 1. Renderer + post ---------------------------------------------------
const renderer = new Renderer(canvas);
const post     = new Post(renderer);

// --- 2. Static scene ------------------------------------------------------
const arena    = createArena(renderer);   // THREE.Group
const water    = new Water(renderer);
const dust     = new Dust(renderer);
const snakeVis = new SnakeMesh(renderer);
const camera   = new GameCamera(renderer);

// --- 3. Food visual (task-16 is pure logic; the mesh lives here) ---------
const foodMesh = new THREE.Mesh(
  new THREE.SphereGeometry(0.28, 24, 24),
  new THREE.MeshStandardMaterial({
    color: 0xff8833, emissive: 0xff5500, emissiveIntensity: 0.9,
    roughness: 0.3, metalness: 0.0,
  }),
);
foodMesh.castShadow = true;
foodMesh.visible  = false;   // driven by state (see bus 'state' handler below)
renderer.add(foodMesh);

// --- 4. Audio -------------------------------------------------------------
const audio = new Audio();

// Unlock on the first user gesture (autoplay policy).
window.addEventListener('pointerdown', () => audio.unlock(), { once: true });
window.addEventListener('keydown',     () => audio.unlock(), { once: true });

// --- 5. Input + state -----------------------------------------------------
const input = new Input().start();
const state = new GameState({ input, water, audio });

// --- 6. HUD ---------------------------------------------------------------
const hud = new Hud();
// Overlay button / click → start or pause.
hud.setActionsHandler(({ type }) => {
  if (type === 'start') state.start();
  else if (type === 'pause') state.togglePause();
});
// Quality buttons → apply tier across renderer/post/dust.
hud.onQualityChange((tier) => {
  renderer.applyQuality(tier);
  post.setQuality(tier);
  dust.rebuild();            // re-reads renderer.quality.dustCount for the new tier
});
// Reflect the auto-detected tier in the HUD on boot.
renderer.tier && hud.setQuality(renderer.tier);

// --- 7. Cross-module bus wiring ------------------------------------------
// Food visual follows state.food cell; show/hide on game state.
bus.on('state', ({ value }) => {
  foodMesh.visible = value === 'RUNNING' && !!(state.food && state.food.cell);
  if (value === 'GAME_OVER') hud.saveScore(state.score, 'PLAYER');
});
// Also refresh food position every frame (it may spawn during running).
// (We piggy-back on the RAF below instead of a bus event for the position.)

// --- 8. Resize -------------------------------------------------------------
function onResize() {
  renderer.resize();
  post.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', onResize);
onResize();

// --- 9. RAF loop ------------------------------------------------------------
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);   // clamp: tab-return hitches
  last = now;
  const t  = now / 1000;

  // advance simulation
  state.tick(dt, t);

  // reflect state
  if (state.food && state.food.cell) {
    const w = toWorld(state.food.cell.col, state.food.cell.row);
    foodMesh.position.set(w.x, 0.15, w.z);
  }
  const head = state.snake.head;
  const inWater = water.isWater(head.col, head.row);
  snakeVis.setWaterWobble(inWater);
  snakeVis.setBody(state.snake.body);

  // follow + shake
  camera.setTarget(state.headWorld.x, state.headWorld.z);

  // update visual systems
  snakeVis.update(dt, t);
  water.update(dt, t);
  dust.update(dt, t);
  camera.update(dt, t);

  // draw
  post.render();

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
```

### Notes on wiring correctness

- **Water visual + gameplay share the same `Water` instance** so that the
  state machine's `isWater` query (used for the slow factor) matches the
  cells drawn on-screen. Task-10 owns the query; task-17 owns the gameplay
  use; this file hands the object to both.
- **Post.render() replaces renderer.render().** `renderer.render` is still
  available for debugging only; the RAF always draws through the composer so
  the cinematic grade is applied even on `low` (vignette + tonemap still run).
- **Audio unlock** happens exactly once on the first pointer/keydown; task-05
  defines `unlock()` as idempotent, so the two listeners do not double-init.
- **Quality change** rebuilds `Dust` (particle count is set from the tier's
  `dustCount`) and calls `Post.setQuality` so bloom is added/removed.
  `Renderer.applyQuality` toggles shadow map + pixel ratio. This is the only
  place a tier change fans out to 3 modules.
- **HUD actions handler** is a callback, not a bus subscription — the bus is
  for *telemetry* (state → HUD display); user *intents* flow through the
  callback that `state._onIntent` also sees from `Input.onInput`. `Input.onInput`
  is registered by `GameState`'s constructor; the HUD handler is a second
  subscriber. (Both fire on the same intent objects; `state` is the only state
  mutator so double-invocation is safe.)
- **Clamp `dt` to 0.1 s** so a backgrounded tab returning does not jump the
  sim 500 ms; the state machine additionally caps to 4 steps/frame (task-17).

### Files produced
- `index.html` at repo root
- `js/main.js`

### Acceptance criteria

- Opening `index.html` over HTTP on a desktop browser with `high` tier:
  - A lit arena with visible walls, the oval + stream water patch, drifting
    dust, and a three-segment snake at the center appears.
  - The overlay shows "SNAKE" + "Press to start" with the Low/Med/High quality
    buttons; `High` is the active button (auto-detect on desktop).
- `Enter` (or clicking the overlay button) starts the game:
  - Overlay hides; snake begins moving east from the center at 8 cells/s.
  - Arrow keys steer; rapid double-turns within a frame are buffered and both
    turns take effect over two successive steps.
- Eating a food:
  - Score increments by 10 on the HUD.
  - Speed display rises (e.g. 3 foods → ~2.1×).
  - Snake grows by one visible segment.
  - A new food sphere appears at a new dry, in-bounds cell.
  - A subtle camera shake pulse (~0.3 × power) is visible.
- Moving the snake head into a water cell:
  - Step cadence visibly slows (~50%) while the head is in water.
  - A single "splash" SFX plays on entry and the snake mesh wobbles.
  - Leaving and re-entering plays the splash again; remaining stationary in
    water does not.
- Wall or self-collision:
  - `GAME_OVER` overlay: "Game Over", final score, and top-10 leaderboard
    (populated from `localStorage`, persisting across reloads).
  - A single loud `death` SFX plays and a strong camera shake (power 1.0) fires.
  - Pressing `Enter` restarts a fresh game from `READY`.
- Quality switch (click each button):
  - `Low`: shadows off, no dust, no bloom, `pixelRatio ≈ 1`.
  - `Medium`: shadows 1024, ~300 dust particles, bloom on, `pixelRatio ≈ 1.5`.
  - `High`: shadows 2048, ~900 dust particles, bloom on, `pixelRatio ≈ 2`.
  - No console errors or dropped frames on a mid-range laptop for `high`;
    no dropped frames on an emulated mid-range mobile for `low`.
- `Space` toggles `PAUSED` / `RUNNING`; sim stops advancing while paused;
  the `PAUSED` overlay shows "Press to resume".
- Resizing the window keeps the arena framed, the camera aspect correct, and
  the post composer in sync (no stretched scene).
- **Zero `console.error` / `console.warn`** output in all the above flows.
- **No `file://` failure**: opening directly via `file://` shows a clear
  on-screen error (via a small script guard in `index.html`) advising to serve
  over HTTP.
- **Definition of done** from requirements.md is met end-to-end:
  start → move → eat → slow-in-water → die → restart → quality toggle →
  leaderboard persistence.
