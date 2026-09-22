# Cloth Simulator — Requirements

Feature contract for the spec at `specs/cloth-simulator/`. IDs are stable; tasks reference them.

## Feature behavior

### R1 — Scene & cloth object
- One cloth object at scene center; default size 2.0 m × 1.5 m; grid resolution 32 × 24 vertices (31 × 23 quads, rendered as 2 triangles per quad).
- Material reads as a white bed sheet: `MeshStandardMaterial`, base color `0xf5f4ef`, `side: THREE.DoubleSide`, `roughness: 0.9`, `metalness: 0.0`.
- Exactly two pinned vertices: top-left and top-right (row 0, indices 0 and `cols-1`). They are fixed at world-space points `(-1.0, 2.2, 0)` and `(1.0, 2.2, 0)` respectively; never moved by the sim, render, or any interaction.
- Small 3D environment: a neutral floor plane (`PlaneGeometry`, `12 × 12`, color `0x8a8f96`, `roughness: 1`) at `y = 0`, a soft hemisphere light, one directional key light from `(3, 5, 2)`, and a large skydome background matching the environment. No other content is required.

### R2 — Cloth physics model
- Mass-spring (Verlet) model. Each vertex has a position `p`, a previous position `pPrev`, an invMass (`0` for pinned), and a wetness scalar `w ∈ [0, 1]`.
- Springs: structural (along rows/columns), shear (diagonals of each quad), and bend (skip-one, both directions). Rest lengths equal the initial Euclidean distances at construction.
- Integration: fixed `dt = 1/120 s` substeps, accumulated from the render frame delta (max 5 substeps per frame, drop excess to avoid death spirals). Verlet: `pNew = 2p - pPrev + a·dt²`, then apply N constraint iterations (default N = 6; see R2 tuning table).
- Damping: `pPrev = lerp(pPrev, p, 0.02)` after the position update (i.e. velocity retained at 98%).
- Gravity: `a_y = -9.8 · (1 + 1.5·w)` — wet vertices accelerate faster (see also R6).
- Constraint iterations are Gauss-Seidel along the spring list; pinned vertices (invMass = 0) receive no update.
- Cloth is initially in a flat, taut configuration at y = 2.0 with a very small random z jitter (`< 0.005 m`) so it settles into a natural drape on load.

### R3 — Cloth rendering
- Cloth is a single `THREE.Mesh` with an indexed `BufferGeometry`. Positions (Float32Array, length `vertCount*3`) and the index buffer are uploaded once and only positions + vertex colors are updated per frame (`position.needsUpdate = true`, `color.needsUpdate = true`).
- Normals are recomputed per frame via `geometry.computeVertexNormals()`.
- Vertex color is derived from wetness: `color = lerp(dryColor, wetColor, w)` where `dryColor = (0.96, 0.96, 0.94)` and `wetColor = (0.35, 0.42, 0.55)` (see [C4](#c-architecture-contracts)). Color is written into the geometry's `color` attribute; material must have `vertexColors: true`.
- Torn quads: when a quad has any of its four structural springs torn, the quad is hidden from the index buffer (its 6 indices are set to point at a hidden degenerate vertex `HIDDEN = vertCount-1` that is positioned at the cloth center). When multiple quads are hidden, `geometry.setDrawRange` is not used — the index buffer stays the same size.
- The renderer reads sim state from `ClothSim`; it never keeps its own copy of vertex positions.

### R4 — Tearing
- Every spring has a `rest` length and a live length computed each constraint pass. If a spring's strain `s = (len - rest) / rest` exceeds `TEAR_STRAIN = 0.35`, the spring is marked torn on the next substep (i.e. the check runs after integration but before constraint solve).
- Torn springs are removed from the constraint iteration list for the rest of the session (they do not heal; `ClothSim.reset()` is the only way to restore).
- Tearing is local: only directly strained springs tear in a given substep; a cascade happens naturally as stress redistributes to neighboring springs over subsequent frames.
- Structural springs must exist for a cloth region to be connected; when the structural springs separating two vertex regions are all torn the two regions behave as independent bodies — no extra bookkeeping is required because Verlet + spring constraints naturally treat them that way.
- Water pressure contribution: `s_effective = s + waterImpulseContribution`, where `waterImpulseContribution` for a spring is the average of `applyImpulse` magnitudes on its two endpoints this substep, scaled by `WATER_TEAR_GAIN = 0.05` (see R5 / R6). A spring that was already torn by pulling tears further (visually widens) as neighboring springs tear.

### R5 — Water hose
- A hose nozzle (small cylinder + torus, `Color 0x1e2126`) is placed as a child of the camera, offset `(0.30, -0.22, -0.55)`, always pointing forward-down by 20°. It is purely decorative; the emission origin is a point `nozzleTip = nozzle.localToWorld(new Vector3(0, 0, -0.1))`.
- Emission: while the primary pointer button is held **in hose mode** (see R8 input mode toggle), emit `RATE = 900 particles/s` from `nozzleTip` with:
  - speed in nozzle direction `v = 6.5 m/s` + `N(0, 0.25)` jitter,
  - lifetime `1.5 s`,
  - gravity `-9.8 m/s²` applied (same as cloth),
  - `radius = 0.008 m` (visual only).
- Rendering: a single `THREE.Points` with a 1024-strong ring-buffer of particle slots. `PointsMaterial` — `size: 0.03`, `sizeAttenuation: true`, `color: 0x9fd0ff`, `transparent: true`, `opacity: 0.85`, additive blending optional but off by default.
- Cloth interaction per substep: for each live particle, find the closest cloth vertex within `HIT_R = 0.06 m` (broadphase: a coarse 12 × 9 grid over the cloth's bounding box, rebuilt per frame). On hit, the particle is killed and:
  - `sim.applyImpulse(i, v_particle · dt · IMPULSE_K)` where `IMPULSE_K = 0.35` (tuned to give a visible dimple),
  - `sim.addWetness(i, WET_ABSORB_PER_HIT = 0.02)` plus diffusion to the 4 ring neighbors at 50% each (see R6).
- Water does not "stick" to cloth; it is removed on hit or falls to the floor and is recycled.

### R6 — Wetness
- Storage: `w: Float32Array(vertCount)` on `ClothSim`, initialized to 0.
- Absorption rules (`ClothSim.addWetness(i, amount)`):
  - `w[i] = min(1, w[i] + amount)`,
  - then spread `amount*0.25` to each of up to 4 ring neighbors (skip pinned, skip torn structural edges between i and the neighbor — a torn edge does not transmit water laterally),
  - wetness never decays within a session.
- Visual: per vertex, `color = lerp(dry, wet, w)` in the geometry's `color` attribute (see [C4](#c-architecture-contracts)); material must have `vertexColors: true`.
- Weight: gravity for vertex i is `g_y = -9.8 * (1 + 1.5 * w[i])`; a fully wet vertex falls 2.5× faster than a dry one. Combined with damping this makes wet regions sag and move more slowly once at rest.
- Uneven wetness is produced naturally because absorption is per hit point and diffusion is small (`0.25`).
- Reset: `ClothSim.reset()` clears `w` to 0 alongside everything else.

### R7 — Camera
- `THREE.PerspectiveCamera(fov = 50, near = 0.1, far = 100)`, initial position `(0, 1.8, 6)` looking at `(0, 1.5, 0)`.
- `OrbitControls` from `three/addons`: `enableDamping = true`, `dampingFactor = 0.08`, `target = (0, 1.5, 0)`, `minDistance = 1.0`, `maxDistance = 15`, `maxPolarAngle = Math.PI * 0.55` (cannot go below the floor).
- Orbit (LMB drag when NOT over the cloth), pan (RMB drag, or LMB + Ctrl), zoom (wheel, pinch on touch).

### R8 — Input modes (no objective)
- Two explicit modes toggled by key `H`:
  - **Grab mode** (default): LMB on the cloth grabs the nearest vertex; LMB on empty space orbits the camera. RMB pans. Wheel zooms.
  - **Hose mode**: LMB on anywhere sprays water from the nozzle (see R5); RMB still pans; wheel still zooms.
- On mode change the cursor changes: `grab` (grab mode) vs. `crosshair` (hose mode).
- Static control hint only, top-left, monospace 11px, semi-transparent dark panel:
  ```
  LMB grab (grab mode) / spray (hose mode)
  RMB pan · wheel zoom · H switch mode · P screenshot (?debug=1)
  ```
- No score, no objective text, no progression. Refreshing the page is the only "reset" the player has at the UX level.

## C — Architecture contracts

### C1 — Modules and ownership

| Module                 | Path                    | Owns                                                                                                   |
|------------------------|-------------------------|----------------------------------------------------------------------------------------------------------|
| Bootstrap / page       | `index.html`            | DOM shell, import map, `<canvas>` mount, control-hint node                                                |
| Styles                 | `css/style.css`         | Body/canvas/hint layout                                                                                    |
| Config (shared const)  | `js/config.js`          | All constants named in this doc (`GRAVITY`, `DT`, `N_CONSTRAINTS`, `TEAR_STRAIN`, `WATER_TEAR_GAIN`, `HIT_R`, `IMPULSE_K`, `WET_ABSORB_PER_HIT`, `COLS`, `ROWS`, `PINNED_POS`, `DRY_RGB`, `WET_RGB`, `RATE`, `DT_SUB_MAX`, etc.) |
| Cloth simulation core  | `js/core/cloth.js`      | Pure JS `ClothSim`: `positions: Float32Array`, `prev: Float32Array`, `wet: Float32Array`, `springs: Int32Array pairs + rest: Float32Array + torn: Uint8Array`, `applyImpulse`, `addWetness`, `step(dt)`, `reset()`, `strain(i)`. NO three.js import. |
| Cloth view             | `js/world/cloth.js`     | `ClothView` wrapping `THREE.Mesh`, syncs sim → geometry, torn-quad hiding, vertex color lerp                                                     |
| Grab interaction       | `js/interact/grab.js`   | Raycast → vertex index, drag → target point, `grab.sim.setPinTemp(i, targetPos)` (a per-interaction pin that overrides gravity for one vertex) |
| Tearing                | `js/interact/tear.js`   | Reads `sim.strain(i)` + water impulse buffer, tears springs past threshold (delegates removal to sim)                                           |
| Water                  | `js/world/water.js`     | `WaterHose` class: ring buffer, spawn/update/render, hit-test against `sim` via a passed-in grid, calls `sim.applyImpulse`/`addWetness`, exposes `impulseMagnitudesPerVertex: Float32Array` consumed by `tear.js` |
| Wetness (view)         | `js/world/wetness.js`   | `updateWetnessColors(geo, sim)` — recomputes `color` attribute from `sim.wet` per frame (view-side only; sim owns the `wet` array) |
| Scene bootstrap        | `js/main.js`            | Renderer, scene, lights, floor, skydome, camera, OrbitControls, mode state, keyboard (H/P), frame loop, `?debug=1` hook                                                                                             |
| Dev server             | `server.js`             | Static file server on :8123 + `POST /save` writing Base64 PNGs to `results/screenshots/`                                                          |

### C2 — Coordinate / sim conventions
- y-up; gravity `-9.8` on y.
- Vertex index convention: `i = row * COLS + col`, row 0 = top row (y-most).
- Pinned positions (world): `PINNED_POS = [ [-1.0, 2.2, 0], [1.0, 2.2, 0] ]`; pinned vertex indices are `PINNED_IDS = [0, COLS-1]`.
- Spring indices: a spring is identified by its `(a, b)` vertex-index pair (`a < b`). The torn-flag array is a separate parallel `Uint8Array` the same length as the spring list.
- `ClothSim` exposes: `positions: Float32Array(vertCount*3)`, `prev: Float32Array`, `wet: Float32Array(vertCount)`, `invMass: Float32Array`, `springs: { a: Int32Array, b: Int32Array, rest: Float32Array, torn: Uint8Array }`, `vertCount`, `cols`, `rows`, `step(dt)`, `applyImpulse(i, dx, dy, dz)`, `addWetness(i, amount)`, `strain(springIndex)`, `reset()`, `setTempPin(i, x, y, z)` / `clearTempPin()`.

### C3 — Frame loop
- `requestAnimationFrame` drives the loop: capture `dt = clamp(now - last, 0, 0.05)`; update `controls.update()`; `simAcc += dt; while (simAcc >= DT_SUB && sub < DT_SUB_MAX) { sim.step(DT_SUB); sub++ }`; then view sync (positions, colors, normals), water update (uses the same substep budget — water's physics runs on the render `dt`, not the sim `dt`, to keep the spray rate stable).
- `DT_SUB = 1/120`; `DT_SUB_MAX = 5`.

### C4 — Color lerp
- `dry = (0.96, 0.96, 0.94)` → rgb `[245, 244, 240] / 255`
- `wet = (0.35, 0.42, 0.55)` → rgb `[90, 107, 140] / 255`
- `color(r,g,b) = wet ? ... : ...` — linear lerp in sRGB space (three's vertex colors are treated as linear, so no gamma conversion is applied; the small mismatch is visually negligible at this scale).

## Non-functional

- **N1 — Performance:** 60 fps on a mid-range 2020 desktop (i5-class, integrated GPU) with the default 32×24 cloth, ~900 visible water particles, and a fully wet + torn cloth. If not met, tune `N_CONSTRAINTS` down to 3 and `HIT_R` down to 0.04 before reducing grid resolution.
- **N2 — No blocking allocation in the hot loop:** substep loop and water update must not call `new` on arrays/objects; use ring buffers and pre-allocated scratch. (Enforced by code review + a `tests/water.test.mjs` check that a 1000-step spray does not grow heap as seen by a simple `--expose-gc`/global.gc() probe if available; otherwise by inspection.)
- **N3 — No console errors in the final integration scenario** (from `http://localhost:8123/` default, no `?debug=1`).
- **N4 — Reload resets everything:** a fresh page load is a fresh cloth (dry, intact). No `localStorage`/`sessionStorage`/cookie usage.

## Coverage mapping

| Req | Task(s) | Check / evidence |
|-----|---------|------------------|
| R1  | 01, 03  | Task 01 smoke (scene, floor, skydome, orbit/pan/zoom) + Task 03 visual (cloth drape, correct color) |
| R2  | 02      | `tests/cloth.test.mjs`: energy decay with N_CONSTRAINTS, pinned-vertex immobility, substep accumulator, drape-settles-to-below-hang-line |
| R3  | 03      | `tests/cloth-view.test.mjs` (run under Node with a DOM stub is NOT required — this test is Node-importable and exercises index/position buffers only); Task 03 visual (double-sided sheet, no z-fighting with pins) |
| R4  | 05      | `tests/tear.test.mjs`: single-spring threshold, cascade under sustained pull, torn does not heal, reset restores |
| R5  | 06      | `tests/water.test.mjs`: emission rate, lifetime, gravity on particles, impulse + wetness calls on hit (asserted via mock sim) |
| R6  | 07      | `tests/wetness.test.mjs`: absorption cap at 1, diffusion to 4 neighbors (blocked by torn edge), gravity multiplier `(1+1.5w)` |
| R7  | 01      | Task 01 browser smoke: orbit/pan/zoom + polar-angle clamp + min/max distance |
| R8  | 01, 04, 08 | Task 01 (hint node present), Task 04 (LMB-over-cloth grabs; LMB-empty orbits), Task 08 (H toggle, cursor, hose mode end-to-end) |
| N1  | 08      | Manual FPS check in the final integration scenario; report in impl log |
| N2  | 06, 08  | `tests/water.test.mjs` allocation probe (or inspection if `--expose-gc` unsupported); final-gate review of `js/core/cloth.js` and `js/world/water.js` hot paths |
| N3  | 08      | Final integration: open console, run the scenario, expect zero errors |
| N4  | 08      | Final integration: hard reload → visual confirmation cloth is dry and intact |
