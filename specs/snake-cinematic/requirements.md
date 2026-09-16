# SNAKE — Cinematic Edition: Requirements

Source design: `design/design.md`. This document is the shared contract for all
tasks. Every task file inlines the subset of this contract it needs plus its own
specifics.

## Decisions (fixed)

- **Renderer:** Three.js loaded from a CDN via ES modules. **No build step, no
  bundler, no asset pipeline.** A single pinned import-map in `index.html`
  provides `three` and `three/addons/`.
  - Pin: `three@0.160.0` (import from `https://unpkg.com/three@0.160.0/build/three.module.js`
    and addons from `https://unpkg.com/three@0.160.0/examples/jsm/`).
- **Quality tiers:** 3 — `low` / `medium` / `high`. Auto-selected on boot from
  device heuristics; overridable in the HUD. See §Quality.
- **Water hazard:** the pond is a *slow* zone, **not** lethal. Entering a water
  cell reduces snake step speed to ~50% and adds a visible wobble/camera tilt.
- **Scope:** complete design — gameplay core, arena, water, dust, camera, post
  grade, procedural audio, local leaderboard, quality tiers.

## Architecture constraint

`index.html` is a **thin layer**: it hosts the canvas/overlays, the CDN
import-map, and boots the app by importing `js/main.js`. **All logic lives in
`js/`.** There is no `package.json`, no bundler config, no `node_modules`.
Everything is plain ES modules consumable directly by the browser.

To preview locally, serve the folder over HTTP (any static server), e.g.
`python -m http.server` or VS Code Live Server. ES modules + `importmap`
require `http(s)://`, not `file://`.

## Directory layout

```
index.html
js/
  main.js                 # entry: boot, quality auto-detect, wiring, RAF loop
  config/
    constants.js          # grid/geometry/score/collision constants (below)
    quality.js            # tier definitions + device detection
  game/
    grid.js               # pure grid math + coordinate mapping
    input.js              # keyboard + touch, emits direction intent
    snake.js              # snake state + stepping logic (data only)
    food.js               # food spawning
    state.js              # game state machine + tick, orchestration
  renderer/
    renderer.js           # Three scene/camera/WebGLRenderer, resize, quality scaling
    arena.js              # ground, walls, sun/light
    water.js              # procedural pond + normal map + water cells
    dust.js               # drifting dust particles
    snakeMesh.js          # 3D snake mesh with smoothed segments
  camera/
    camera.js             # follow cam, framing, event-driven shake
  post/
    post.js               # EffectComposer: bloom, vignette, tonemap, grade
  audio/
    audio.js              # WebAudio procedural SFX + ambient, no assets
  ui/
    leaderboard.js        # provider interface + localStorage impl
    hud.js                # score, speed, quality toggle, pause, game-over
```

## Coordinate system & grid

- Grid is **1-based logically, indexed 0..N-1**. `GRID_W = GRID_H = 21`
  (odd so there is an exact center = 10,10).
- `CELL = 1.0` world units. Arena spans `[-GRID_W/2, +GRID_W/2]` on X (east) and
  Z (south).
- Mapping (grid → world, flat XZ plane, Y = up):
  ```
  worldX(col) = (col - GRID_W/2 + 0.5) * CELL
  worldZ(row) = (row - GRID_H/2 + 0.5) * CELL
  ```
  So cell (10,10) → world (0, 0) center. +X is right, +Z is toward camera/down
  screen. Snake moving "up" the screen = decreasing row = **-Z**.
- Cell keys are strings `"col,row"`.

## Grid constants (`config/constants.js`)

```js
export const GRID = { W: 21, H: 21, CELL: 1.0 };
export const CENTER = { col: 10, row: 10 };
export const DIRECTION = {
  UP:    { x: 0, z: -1 },   // row-1  (-Z, up screen)
  DOWN:  { x: 0, z: 1 },    // row+1
  LEFT:  { x: -1, z: 0 },   // col-1
  RIGHT: { x: 1, z: 0 },    // col+1
};
export const SPEED = {
  baseCellsPerSec: 8,     // starting
  perFood: 0.35,          // added each food
  maxCellsPerSec: 15,
  waterFactor: 0.5,       // step speed multiplier while head cell is water
};
export const SCORE_PER_FOOD = 10;
export const SNAKE_START_LENGTH = 3;
export const WATER_WOBBLE = 0.35;  // radians of extra cam/mesh tilt in water
```

## Quality tiers (`config/quality.js`)

```js
export const QUALITY_TIERS = {
  low: {
    label: 'Low',
    pixelRatio: 1,                 // no HiDPI upscale
    shadows:        { enabled: false, mapSize: 512 },
    dustCount:      0,             // none
    waterSegments:  16,
    post: { bloom: false, vignette: true, tonemap: true },
    followShake:    false,
  },
  medium: {
    label: 'Medium',
    pixelRatio: 1.5,
    shadows:        { enabled: true,  mapSize: 1024 },
    dustCount:      300,
    waterSegments:  32,
    post: { bloom: true, vignette: true, tonemap: true },
    followShake:    true,
  },
  high: {
    label: 'High',
    pixelRatio: 2,
    shadows:        { enabled: true,  mapSize: 2048 },
    dustCount:      900,
    waterSegments:  64,
    post: { bloom: true, vignette: true, tonemap: true },
    followShake:    true,
  },
};

// Returns 'low' | 'medium' | 'high'
export function detectQuality() { /* see task */ }
```

`detectQuality()` heuristic (implement in task):
- `isMobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) || 'ontouchstart' in window`
- Start: mobile → `low` (or `medium` if `devicePixelRatio >= 2 && navigator.hardwareConcurrency >= 8`), else `high`.
- Respect `matchMedia('(prefers-reduced-motion: reduce)')` by capping at `medium`
  (dust + shake off).

## Water pond layout

Water occupies a fixed set of grid cells (procedurally described, no assets).
`water.js` exposes `getWaterCells() -> Set<string>` and `isWater(col,row) -> bool`.
Base layout (a diagonal stream + an oval pond), kept **away from the center spawn
(10,10)** and away from the first few steps:

```
// oval pond near top-left
oval centered (c=5, r=5), semi-axes a=3 (col), b=2 (row)
// stream along the right side
cells with col in [14..16] and row in [8..13]
```

Rules:
- Center (10,10) and its immediate neighbors must not be water.
- `food.js` must **not** spawn food on water cells.
- Water is rendered as a patch **just below** the ground plane at those cells
  (Y slightly less than ground top) with an animated procedural normal map that
  produces moving ripples; a single shared animated `DataTexture` normal map.

## Game rules (`state.js`)

- State machine: `READY → RUNNING → PAUSED`, `RUNNING → GAME_OVER → READY`.
- Snake stepping is **discrete** in grid space: one cell per step. Step interval
  `dt = 1 / effectiveSpeed`. Accumulate time in the RAF loop; on threshold
  advance the snake.
- `effectiveSpeed = SPEED.max-capped(base + foods*perFood)`, multiplied by
  `waterFactor` when the **head cell is water** (slows step cadence).
- Render smoothing is separate: `snakeMesh.js` lerps segment world positions
  toward their target cell centers each frame so motion looks continuous
  regardless of the step cadence.
- **Death conditions:** hitting a wall (out of bounds) or colliding with own
  body. **Water is not lethal.**
- On death: freeze, play SFX, show game-over overlay, attempt leaderboard entry.
- Score: `+SCORE_PER_FOOD` per food eaten.

## Events (lightweight bus, defined in `state.js` or a helper)

Use a tiny `EventEmitter` (add/remove/emit) **not** DOM events, to decouple
systems. Emitted events:
- `shake: { power }` — e.g. on eat (0.3), on death (1.0), on wall graze (0.4).
- `sfx: { name }` — names: `eat`, `death`, `ui`, `turn`, `splash`.
- `speed: { value }` — effective speed changed (HUD).
- `score: { value }`.
- `state: { value }` — state machine changed.

`camera.js` listens to `shake`. `audio.js` listens to `sfx`. `hud.js` listens
to `score`/`speed`/`state`.

## Audio (`audio.js`)

WebAudio, generated procedurally (oscillators + noise buffers + filters).
**No audio files.** Must handle browser autoplay policy: create/resume the
`AudioContext` on first user gesture. Expose `play(name)` and subscribe to the
`sfx` event. Ambient: very low filtered noise loop (wind/water) at low gain.

## Leaderboard (`leaderboard.js`)

- Provider interface: `LeaderboardProvider { top(n): Promise<Entry[]>,
  add(score:number, name:string): Promise<Entry> }`. `Entry = { score, name, ts }`.
- `LocalStorageLeaderboard` implements it (key `snake-cinematic:leaderboard`,
  sorted desc, capped at 10). Default display name `'PLAYER'`.
- `leaderboard.js` exports a factory `createLeaderboard() -> LocalStorageLeaderboard`.

## Performance target

60 fps desktop / 30 fps mid-range mobile under each quality tier. Avoid per-frame
object allocation in hot loops; reuse vectors/objects. Pause rendering work when
tab hidden (RAF naturally stops).

## Definition of done (whole feature)

Open `index.html` over HTTP → press any key/arrows to start, snake moves, eats
food, slows in water, dies on wall/self, score + leaderboard persist, quality
toggle works, dust/shake/post/audio active per tier, no console errors.
