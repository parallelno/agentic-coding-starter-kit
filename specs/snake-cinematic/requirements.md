# Snakes — Cinematic Edition: Requirements

Source design: `design/game.md`. This document is the complete feature contract.
Stable requirement IDs are referenced by task files; do not renumber.

## 1. Scope and Quality Bar

- **R-SCOPE-01** Single-page web game. Entry points: `index.html` (thin layer: canvas
  element, HUD skeleton, one `<script type="module">` to `js/main.js`; no inline logic)
  and `js/` (all logic).
- **R-SCOPE-02** No external assets, CDN, or build step. `three` is the only
  dependency, installed as a normal Node dependency and imported as an ES module
  (`import ... from 'three'`, addons via `three/addons/*`). All textures,
  environment maps, sounds, and sprites are generated in code.
- **R-SCOPE-03** Quality bar: 60 fps desktop / 30 fps mid-range mobile under the
  quality tiers (R-PERF-01). Playable before decorative: core loop (movement, food,
  death, score) must work with decorative systems stubbed out; decorative systems
  must never break the core loop.
- **R-SCOPE-04** Non-goals (must not exist): multiple arenas, level editor,
  multiplayer, backend/accounts, cutscenes.

## 2. Core Rules (pure logic, no DOM / no three)

Shared shape — all consumers use these exact names:

```js
// logical grid
GRID = 20                 // cells per side, indices 0..19
TILE = 1.0                // world units per cell
// logical cell (c, r) -> world center: x = c - 9.5, z = r - 9.5  (arena spans -10..10)
// direction: {c: 0, r: -1} (north, -Z), {c: 1, r: 0}, {c: -1, r: 0}, {c: 0, r: 1}

TICK_MS = 160             // one cell per tick at base speed
POND_FACTOR = 0.45        // movement speed multiplier on pond cells (=> ~355.6 ms/tick)
TICK_ACCEL_MS = 1         // speed-up per point of score; floor 60 ms per tick
MAX_BUFFER = 2            // max queued direction changes

// snake state snapshot (shared shape used by core, engine, visuals, HUD)
{
  state: 'menu' | 'playing' | 'paused' | 'dead',
  snake: [ { c, r, pond: boolean }, ... ],   // head first
  direction: { c, r },
  food: { c, r } | null,
  score: number,          // (length - 3) * 10
  alive: boolean,
  won: boolean,           // terminal dead state caused by filling the board
  deathCell: { c, r } | null,   // set only on loss (null on win)
}
// `best` is carried on the engine's `state` EVENT only (engine merges the
// leaderboard); the core snapshot never contains it.
```

- **R-CORE-01 Board.** Square logical grid `GRID x GRID`. Top-down: world +X is
  grid `c`, world +Z is grid `r` (screen-down). Out-of-bounds = wall collision.
- **R-CORE-02 Movement.** Each tick the head advances one cell in the current
  direction. Reversal (exactly opposite of the active direction) is ignored. The
  input queue holds at most `MAX_BUFFER` pending turns; each tick dequeues one
  valid turn. On a pond cell the tick clock runs at `POND_FACTOR` speed (no
  damage, hazard is slowdown only).
- **R-CORE-03 Food.** Spawned on a uniformly random **dry** cell not occupied by
  the snake (dry = outside the pond, R-WORLD-02). Drawn from an injected RNG
  (`createGame({ rng })`, default `Math.random`). If no eligible cell remains the
  game is won: the core enters the terminal `dead` state with `won: true`,
  `alive: false`, `deathCell: null` (no dolly, no damage frame); the `state` event
  carries `won: true` and the HUD shows the win overlay variant (R-CINE-02).
  Food is eaten when the head enters its cell.
- **R-CORE-04 Death.** Wall collision or collision with own body (head entering
  any body cell) sets `alive = false`. The cell just vacated by the tail counts as
  free when the snake does **not** grow that tick (standard snake rule).
- **R-CORE-05 States.** `menu | playing | paused | dead`.
  - `menu -> playing` (start), `playing -> paused` (pause), `paused -> playing`
    (resume), `playing | paused -> dead` (death or win; no ticking while dead).
  - Starting or restarting from `dead` resets score and snake; pond and food
    placement re-initialize; leaderboard is not touched until death.
  - Tick interval scales with score: `max(TICK_ACCEL_MS*60, TICK_MS/ (1 + score/100))`
    simplified contract: interval ms = `max(60, 160 - floor(score / 10))` (i.e.
    one tick shortens per 10 points, floor 60 ms).
- **R-CORE-06 Score and leaderboard.** Score = `(length - 3) * 10`. On death, the
  score is submitted through the injected leaderboard provider (R-ARCH-03):
  top-10 list, descending; ties keep earlier-entry order (stable). `best()` =
  first entry or 0.

## 3. Input

- **R-INPUT-01 Keyboard.** Arrows `ArrowUp/Down/Left/Right` and `KeyW/A/S/D` queue a
  turn (screen-relative: Up = -Z, Left = -X). `Space` and `KeyP` toggle pause when
  `playing|paused`; `Space`/`Enter` start (`menu`) or restart (`dead`). `KeyM`
  toggles mute. All key handling goes through the input module only; it must not
  call the engine directly during `dead` for direction changes.
- **R-INPUT-02 Touch.** Pointer-based swipe: a pointer sequence with a dominant
  axis and displacement >= 24 CSS px queues one turn for that axis. Tap (no
  dominant axis) does nothing. Swipe works in `playing` and, once, in `paused`
  (treated also as resume).
- **R-INPUT-03 Guards.** Input is a pure event source: it emits
  `{type: 'turn'|'start'|'pause'|'mute', dir?}` events to a subscriber provided at
  install time; no DOM state mutation, no three imports. `installInput({ emit,
  document })` / `uninstallInput()`; `document` is injectable for tests.

## 4. World and Visuals (three.js)

- **R-WORLD-01 Lighting/environment.** HemisphereLight (sky `0xbfd9ff` / ground
  `0x8a7f6a`) + one warm DirectionalLight "sun" (`0xffe6c0`, position (12, 18, 8))
  with shadows: ortho shadow camera extent ±13, map size per tier (R-PERF-01).
  Procedural environment map (gradient sky built from a small canvas texture via
  `PMREMGenerator`) drives reflections; per-material `envMapIntensity` 0.3-0.7.
  Exactly these two lights; no dynamic point lights.
- **R-WORLD-02 Pond.** Circular hazard: logical center (14, 14), radius 3.0 cell
  units. A cell is **wet** iff `(c-14)^2 + (r-14)^2 <= 9`. Wet predicate exported
  from `js/game/core.js` (`isWet(c, r)`) — single source of truth for core (tick
  speed), food spawn, and water visuals. Visuals: transparent circular water mesh
  (see task 09) + pale foam ring at the boundary.
- **R-WORLD-03 Arena.** Sunlit floor: a `GRID*TILE` plane with a procedural
  canvas-generated sand/concrete albedo (noise + faint 1-cell grid lines) and a
  matching roughness map. Four thin wall boxes (height 0.5, thickness 0.4) just
  outside the grid edges, sharing the wall material.
- **R-WORLD-04 Snake.** Single `InstancedMesh` of box segments
  (`TILE*0.9` wide, 0.55 tall), one instance per cell, head-first order with per
  instance color gradient (bright head `0x4fd18b` -> darker tail `0x1d5c3d`).
  Head gets two small sphere eyes placed opposite the current direction. Segment
  meshing must not allocate per frame (reuse matrices/colors).
- **R-WORLD-05 Food.** Emissive icosahedron (`0xff9f43` emissive, warm), floating
  (sin bob, ±0.08 world units, 2 Hz) and slowly rotating. No dynamic light.
- **R-WORLD-06 Particles.** Environmental dust: `THREE.Points` with a generated
  soft-blob sprite, slow downward+drift velocity, wrapping inside a box above the
  arena; count from quality tier (80/240/500). Food burst: pooled `THREE.Points`
  (48 particles, additive blending, 0.6 s lifetime, small gravity, fade out), one
  burst per `eat` event from the same pool. Both systems update without
  per-frame allocation (preallocated buffers).
- **R-WORLD-07 Post pipeline.** Low tier: direct renderer output (no composer).
  Standard: `EffectComposer` = `RenderPass` + `SMAAPass`. High:
  `RenderPass` + `SMAAPass` + `UnrealBloomPass` (luminanceThreshold 0.85,
  intensity 0.4) + `OutputPass`. Composer sizes follow renderer size changes.
- **R-WORLD-08 Camera shake.** Additive decaying impulses: events push
  `{amp}`; offset magnitude `min(sum amp * exp(-6 * t_since), 0.5)` world units,
  direction from a fixed hash per event (deterministic per (event, time)). Eat
  amp 0.08, death amp 0.45. Applied as renderer-camera offset after follow logic
  (task 10), never fighting it.

## 5. Camera Language and UI

- **R-CINE-01 Camera framing.** FOV 45. `playing|paused`: 3/4 view at
  (0, 13, 17.5) looking at (0, 0, 0), plus idle drift: Lissajous (x = 0.15*sin(0.11t),
  z = 0.15*sin(0.07t)) on the camera position only. `menu`: slow orbit around
  center, radius 20, height 12, period 60 s. `dead`: over 1.5 s ease-in dolly from
  the playing position toward a low 3/4 framing of the death cell (distance 8,
  height 3), then hold. Camera logic is a pure function of (state, t, deathCell)
  returning position + target, exposed for unit tests.
- **R-CINE-02 HUD.** DOM overlay (outside canvas). Persistent top bar: score,
  length, best. Overlays per state: `menu` (title "SNAKE — Cinematic Edition",
  "space to start", control hint), `paused` ("paused — space to resume"), `dead`
  (final score, top-3 leaderboard list, "space to play again"); `won` variant of
  the dead overlay. Mute indicator bottom-right (updates on mute). Styled with
  the shared `js/style.css` owned by task 01: dark translucent panels, system
  font stack only (no web fonts). HUD updates react to engine state events only
  (R-ARCH-04), never polling.
- **R-UI-01 Audio.** WebAudio, fully synthesized: `eat` 660→880 Hz square 80 ms;
  `death` 440→110 Hz sawtooth 400 ms; `resume` 520 Hz sine 60 ms; master gain
  0.25; mute flag suppresses all output. `AudioContext` creation/resume is
  deferred to the first user gesture. The engine calls a `SoundBackend`
  interface (`play(name)`, `setMuted(bool)`, `isMuted()`) — the real WebAudio
  implementation lives in `js/ui/audio.js` and is injectable (tests use a spy).

## 6. Performance / Quality Tiers

- **R-PERF-01 Tiers.** `low`: pixelRatio 1, dust 80, no composer, shadow map 1024.
  `standard`: pixelRatio min(dpr, 1.5), dust 240, SMAA, shadow map 2048.
  `high`: pixelRatio min(dpr, 2), dust 500, SMAA + bloom, shadow map 2048.
  Default `standard`. Selection (pure function `pickQuality`): URL param
  `?quality=low|standard|high` > stored `localStorage['snake_quality']` >
  mobile UA (`/Android|iPhone|iPad|Mobile/i`) → `low`, else `standard`.
  Re-reading happens at boot only; no runtime tier switching.
- **R-PERF-02 Frame loop.** `requestAnimationFrame` with a clamped delta
  (max 100 ms) feeding a fixed-step simulation via the score-scaled tick interval
  (R-CORE-05); pond cells use the `POND_FACTOR` multiplier on the step
  accumulator (R-CORE-02). Rendering runs every frame; simulation does not run at
  all while `paused|menu|dead` (render the static scene so pause looks alive).
- **R-PERF-03 Pause/visibility.** `visibilitychange` to hidden while `playing`
  auto-pauses. On resume the clock is reset (no dt spike).
- **R-PERF-04 Hot-path budget.** No per-frame JS allocations on the main path
  (reuse scratch vectors/matrices; particle and snake buffers preallocated).
  Snake = 1 draw call (instancing). Total scene draw calls < 40 at high tier.

## 7. Architecture Contracts

- **R-ARCH-01 Module map and ownership.**
  | Path | Layer | May import |
  |---|---|---|
  | `index.html`, `js/style.css` | shell | — (css) |
  | `js/game/core.js` | pure logic | nothing (no DOM, no three, no node builtins) |
  | `js/input/input.js` | pure + platform adapter | nothing (document injected) |
  | `js/providers/rng.js`, `js/providers/leaderboard.js`, `js/providers/quality.js`, `js/providers/sound.js` | pure + platform adapter | node builtins only in tests; browser APIs guarded (`typeof localStorage`) |
  | `js/engine/engine.js` | composition of logic | `js/game/*`, `js/input/*`, `js/providers/*`, `three` |
  | `js/world/materials.js`, `environment.js`, `floor.js`, `walls.js`, `snake.js`, `food.js`, `dust.js`, `water.js`, `camera.js` | scene systems | `three`, `three/addons/*`, `js/game/core.js` (wet predicate only) |
  | `js/ui/hud.js`, `js/ui/audio.js` | DOM / audio | `js/game/core.js` (shape consts), DOM/WebAudio in browser only |
  | `js/main.js` | composition root | everything |
  World modules never import engine, ui, or input. `js/main.js` is the only file
  that instantiates the engine and wires world modules into the scene.
- **R-ARCH-02 Headless testability.** `GameEngine` accepts injected
  `graphics`: `{ renderer, composer, size(w, h), render(dtState) }` plus a
  `canvas`-sized object; with a mock graphics + fake clock the full state machine
  (start/pause/death/win, tick, score, events) runs under Node without WebGL or
  DOM. `js/main.js` uses a factory `createRealGraphics()` (in `js/world/`) that
  builds renderer/composer; tests never import `main.js`.
- **R-ARCH-03 Providers.** Injectable via construction:
  `createGame({ rng, leaderboard })`, `createEngine(…) → new GameEngine({
  game, input, sound, graphics, clock, quality })`,
  `createLeaderboard({ storage })` (default `globalThis.localStorage` guarded,
  key `snake_scores` JSON array; falls back to in-memory on any storage throw),
  `seededRng(seed)` (mulberry32, deterministic), `pickQuality({ param, stored,
  isMobile, dpr })`, `tierConfig(tier)`, `createSoundBackend({ audioCtx })`
  (real) vs. spy backends in tests.
- **R-ARCH-04 Events.** Engine emits on a simple synchronous bus
  `engine.on(evt, fn) → unsubscribe`:
  - `state` → `{ ...core snapshot fields (R-ARCH-05), length: number, best: number,
    top: [{score}, ...] }` — the top-3 leaderboard entries (stable order), empty
    until any score is recorded; `best` = `top[0].score || 0`. Emitted on
    `start`, `pause`, `resume`, `dead` (death **or** win), and after every `eat`.
  - `eat` → `{ c, r }` (world: shake + burst + sound; sound via R-UI-01 backend)
  - `death` → `{ c, r, won: boolean }` — loss cell (null-safe: on win the core
    deathCell is null and the engine emits `{ c: null, r: null, won: true }`)
  - `mute` → `{ muted }`
  Consumers (world visuals, HUD, audio) register themselves in `main.js` only.
- **R-ARCH-05 Shared snapshot.** The exact `snake state snapshot` shape in §2 is
  the contract between core, engine, `snake.js` visual (reads via
  `engine.gameState()`), `water.js` (wet predicate from core), and HUD (score/
  length/best from `state` events). No module re-derives it differently.
- **R-ARCH-06 ESM policy.** Repo root `package.json`: `{ "type": "module", ... }`.
  All source uses classic ESM (`import`/`export`), `.js` extensions on imports
  where Node would resolve (tests), no TypeScript, no bundler.

## 8. Test and Verification Strategy

- **R-TEST-01 Node tests.** Node >= 20 (CI/dev: v24). Command:
  `npm test` → `node --test "tests/*.test.mjs"` (the quoted glob is portable on
  Windows; bare `node --test tests/` fails there). Durable tests live in `tests/*.test.mjs`
  (one file per owning task, unique name per task). Pure `js/game/` and
  `js/providers/` modules import directly. `js/world/*` modules must expose their
  math as pure functions (e.g. wet predicate usage, particle positions, camera
  pose) so Node tests cover them without WebGL; anything requiring a real GL
  context (shader compile, composer, instancing render) is covered by the
  browser checklist below, reported as manual/visual, never as passed-in-Node.
- **R-TEST-02 Engine headless.** Full state-machine + scoring behavior via
  mock graphics/clock (R-ARCH-02), including deterministic seeded games
  (`seededRng`) for replay assertions (e.g. first food position for seed 1).
- **R-TEST-03 Browser/visual checklist (final integration).** Dev check:
  `python -m http.server 8000` (or any static server) → `http://localhost:8000`:
  - [ ] menu overlay visible, 3/4-orbit camera, dust drifting, water shimmer,
        no console errors, ~60 fps on desktop (standard tier)
  - [ ] space starts; arrow keys steer; reversal ignored; buffer works (press two
        quick turns, both applied on successive ticks)
  - [ ] snake crosses pond visibly slower (no damage)
  - [ ] eating: grow, score +10, shake + particle burst + blip; camera shake on
        death is clearly larger
  - [ ] wall and self death → dead overlay with top-3 list; space restarts
  - [ ] pause/resume (space + tab-hidden auto-pause); mute (M) silences
  - [ ] `?quality=high` shows bloom; `?quality=low` runs on integrated GPU
        (~30+ fps phone-scale)
  - [ ] swipe on a touch device (or touch-emulator) steers
  These are manual; automated checks must not claim them as passed.
- **R-TEST-04 Gates.** Task gate: task's own `tests/<name>.test.mjs` green.
  Wave gate: all tests of the wave's tasks green together
  (`npm test`). Final gate: full suite + R-TEST-03 checklist executed
  and recorded in the README checkpoint. Syntax-only checks never count.

## 9. Requirement → Task / Check Coverage

| Requirement | Task(s) | Primary check(s) |
|---|---|---|
| R-SCOPE-01..04 | 01, 13 | task-01/13 tests; R-TEST-03 items 1, 7 |
| R-CORE-01..06 | 02 | `tests/core.test.mjs` (movement, buffer, reversal, growth, self/wall death incl. tail-vacate case, score, speed scaling, deterministic seeded spawn, win condition) |
| R-INPUT-01..03 | 03 | `tests/input.test.mjs` (emitted events for keys + synthetic swipes, guards per state via injected subscriber) |
| R-WORLD-01..06, R-WORLD-08 | 06, 07, 08, 09, 10 | per-task tests (pure math) + R-TEST-03 items 1-5 |
| R-WORLD-07 (post pipeline) | 04 (tier flag), 13 (composer construction) | `tierConfig.composer` assertion (providers test) + R-TEST-03 item 7 (bloom / low-tier check) |
| R-CINE-01 | 10 | `tests/camera.test.mjs` (pose per state incl. dead-dolly timeline) + R-TEST-03 |
| R-CINE-02 | 11 | `tests/hud.test.mjs` (pure format/visibility logic) + R-TEST-03 items 1, 5 |
| R-UI-01 | 11, 05 | spy-backend assertions in engine + hud tests + R-TEST-03 item 6 |
| R-PERF-01..04 | 04, 05, 13 | `tests/providers.test.mjs` (pickQuality precedence, tier values), engine timing tests (R-ARCH-02), R-TEST-03 items 1, 7 |
| R-ARCH-01..06 | 01, 12, 13 (+ all) | layering enforced by task ownership; `npm test` runs everything; R-TEST-03 item 1 (no console errors) |
| R-TEST-01..02 | 12 | `npm test` itself (full suite, incl. deterministic replay) |
| R-TEST-03 | 13 | browser/visual checklist executed and recorded in the README checkpoint |
| R-TEST-04 | 12, 13 | per-wave `npm test` gates (12) + final gate (13) |

No requirement is left without a task and a check.
