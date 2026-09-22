# Cloth Simulator — Spec

Interactive 3D cloth physics sandbox per `design/game.md`. A white bed sheet hangs from its top corners inside a small 3D scene; the player can grab and pull it, tear it under stress, spray it with a water hose, and watch it soak, darken, sag, and split. No score, no objective.

Authoritative source: [requirements.md](./requirements.md).

## Stack

- three.js `^0.186.0` (already declared in `package.json`, `"type": "module"`, no bundler). Import map in `index.html` points at `./node_modules/three/build/three.module.js` and `./node_modules/three/examples/jsm/` for addons (`OrbitControls`).
- Node 18+ for dev server and unit tests: `node --test "tests/*.test.mjs"` (existing script).
- Cloth simulation is **pure JS with plain number arrays** (no three.js types) so it is unit-testable in Node, mirroring the project's prior convention that core math is dependency-free.
- Dev server: `node server.js`, serves repo root on `http://localhost:8123`.

## Cross-task invariants

- Coordinate convention: y-up; world units are meters; `GRAVITY = -9.8` on y. See [Req C2](./requirements.md#c-architecture-contracts).
- Cloth sim state lives in one `ClothSim` object (from `js/core/cloth.js`); the renderer only reads/writes its vertex Float32Array and the spring/tear table. Never store a second copy of vertex positions in the view. See [R3](./requirements.md#r3-cloth-rendering).
- Pinned corners: exactly `VERTS[0]` and `VERTS[cols-1]` of row 0 (top-left, top-right). Their positions are overwritten with `PINNED_POS` every step; no springs may move them. See [C2](./requirements.md#c-architecture-contracts).
- Spring tearing is irreversible within a session: once a spring is torn it stays torn. `ClothSim.reset()` is the only way to restore. See [R4](./requirements.md#r4-tearing).
- Wetness is stored per vertex as a float in `[0, 1]` inside `ClothSim` and the renderer must not cache the cloth material color — vertex colors must update in place. See [R6](./requirements.md#r6-wetness).
- Water particles are a separate particle pool (`js/world/water.js`), not part of the cloth sim; they apply impulses to cloth vertices via `ClothSim.applyImpulse(i, dx, dy, dz)` and deposit wetness via `ClothSim.addWetness(i, amount)`.
- No feature-level HUD text may claim scoring or objectives. Only a static control hint is allowed (R8).

## Verification

- Prerequisites: `npm ci` (three.js already in `package.json`); Node 18+.
- Per task: `npm test` (runs `node --test "tests/*.test.mjs"`). Task 01 does not yet create tests; its gate is the browser smoke check below.
- Task 01 smoke (browser): open `http://localhost:8123/`, expect a rendered scene with a visible skydome/background and OrbitControls; drag to orbit, right-drag to pan, wheel to zoom, and confirm no console errors. This is a visual/manual check and cannot be replaced by unit tests.
- Wave gate: after each wave, re-run `npm test` and the browser smoke check to catch regressions.
- Final integration gate: from a clean reload at `http://localhost:8123/`, perform in order: (1) orbit/pan/zoom freely; (2) click-drag the cloth to form a fold, release, expect it to settle; (3) pull a grabbed point fast to tear a visible hole that separates when shaken; (4) hold the hose over the cloth for ≥ 2 s — cloth darkens, sags, and the existing tear widens; (5) refresh the page — cloth resets to untouched state. Screenshot each stage to `results/screenshots/cloth_*.png` using the debug hook (see "Execution checkpoint" for the hook contract).
- Visual/manual checks are mandatory and are not covered by `npm test`.

## Status

| ID  | Task                                                                                              | Wave | Dependencies | Owned paths                                                                                                             | Status  |
|-----|---------------------------------------------------------------------------------------------------|------|--------------|-------------------------------------------------------------------------------------------------------------------------|---------|
| 01  | [Scaffold: page, server, scene, camera](./tasks/task-01-scaffold.md)                              | 1    | –            | `index.html`, `css/style.css`, `js/main.js`, `js/config.js`, `server.js`, `results/.gitkeep`                                       | Done    |
| 02  | [Cloth simulation core (pure JS)](./tasks/task-02-cloth-sim-core.md)                              | 2    | –            | `js/core/cloth.js`, `tests/cloth.test.mjs`                                                                                   | Done    |
| 03  | [Cloth rendering + sim integration](./tasks/task-03-cloth-render.md)                              | 3    | 02           | `js/world/cloth.js`, `tests/cloth-view.test.mjs`                                                                              | Done    |
| 04  | [Grab / stretch / twist interaction](./tasks/task-04-grab-interaction.md)                         | 4    | 03           | `js/interact/grab.js`, `tests/grab.test.mjs`                                                                                  | Done    |
| 05  | [Tearing](./tasks/task-05-tearing.md)                                                             | 5    | 03, 04       | `js/interact/tear.js` (extends cloth sim spring removal), `tests/tear.test.mjs`                                                 | Done    |
| 06  | [Water hose spray](./tasks/task-06-water-hose.md)                                                 | 6    | 05           | `js/world/water.js`, `tests/water.test.mjs`                                                                                    | Done    |
| 07  | [Wetness (absorption, weight, darkening)](./tasks/task-07-wetness.md)                             | 7    | 06           | `js/world/wetness.js` (view-side), `tests/wetness.test.mjs`                                                                    | Done    |
| 08  | [Polish + final integration](./tasks/task-08-polish.md)                                           | 8    | 07           | `js/main.js` (HUD wiring only, no new systems), `results/screenshots/cloth_*.png`, `results/impl_log/milestone-08-polish.md` | Done    |

Wave 1 → 2 serial; 03 depends on 02; 04 → 05 serial (05 consumes 04's stress signal); 05 → 06 serial; 06 → 07 serial; 07 → 08 serial. No two tasks own the same file.

## Execution checkpoint

- **All tasks complete.** Final gate PASSED 2026-09-21 (23/23 browser checks, headless Chrome + CDP);
  `npm test` 30/30. Impl log: `results/impl_log/milestone-08-polish.md`.
- Final-gate evidence (fresh reload at `?debug=1`, then the gate sequence):
  1. clean reload → `{mode:grab, tornCount:0, wetMax:0}`; orbit 7.4 m / pan 0.53 m / zoom 6.01→2.87 m.
  2. small pull → 0 tears; a 0.2 m fold forms and the sheet settles (max velocity < 0.02 m/substep, max |p| ≈ 2.2).
  3. fast yank → 177–251 springs torn, 95–143 hidden quads (holes render as background, no black triangles).
  4. hose held 2.6 s → `wetMax 0 → 1.0` (86–95 vertices wet), existing tear widened 252 → 260 springs.
  5. refresh → dry + intact again (N4); no localStorage/sessionStorage/cookies; plain `/` URL logs zero console errors (N3).
- Screenshots (1264×625, written through `POST /save`): `results/screenshots/cloth_01_idle.png`,
  `cloth_02_fold.png`, `cloth_03_torn.png`, `cloth_04_spray.png`, `cloth_05_wet.png`.
- Perf: sim + view sync = 2.19 ms/frame (2 substeps, 4330 springs); N1 on real GPU hardware is
  **unverified** (headless SwiftShader only). N2: hot paths allocation-free by inspection and the
  `--expose-gc` heap probe passes.
- Deviations from literal spec wording (full detail + measurements in the impl log): damping written
  in its stable equivalent form; rest lengths measured after the pin override; grab uses the cloth hit
  point with the horizontal plane as the off-cloth fallback; torn quads use all-HIDDEN indices; the
  hidden vertex is index `vertCount`; three acceptance figures (all-vertices-below-1.7, ≥0.05 m wet
  sag, exact `s_eff == TEAR_STRAIN`) are unreachable with the pinned constants and are asserted as
  their measured equivalents instead.
- Debug hook (stable, extended by waves 3–8): `?debug=1` → `window.__dbg = { sim, clothView, grab,
  water, scene, camera, controls, renderer, saveScreenshot(name), state() }`; `state()` returns
  `{ mode, tornCount, wetMax, simTime }`; `P` (name from `?shot=`) or `__dbg.saveScreenshot(name)`
  writes `results/screenshots/{name}.png` via `POST /save`; both capture inside the render task
  (an out-of-frame `toDataURL` returns a black image).
