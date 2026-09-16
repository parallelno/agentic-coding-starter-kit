# Task 06: Lighting, environment, floor, walls
Wave: 3
Depends on: 01
Owns: `js/world/materials.js`, `js/world/environment.js`, `js/world/floor.js`,
`js/world/walls.js`, `tests/environment.test.mjs`
Risk: normal (visual-only; no gameplay logic)
Requirements: R-WORLD-01, R-WORLD-03, R-PERF-04, R-ARCH-01, R-ARCH-06

## Goal
A sunlit PBR arena: exact two-light rig, procedural environment map, procedural
sand/concrete floor with grid lines, four wall boxes. Pure canvas-texture math is
exported for Node tests; construction code takes an injected `THREE`-compatible
environment so tests never need a GL context for math checks.

## Contract
- `js/world/materials.js` (pure, Node-importable):
  - `hash2(c, r)` / `valueNoise(x, y, scale)` — deterministic, seeded by a fixed
    integer salt; document the oracle: `valueNoise(0.5, 0.5, 4)` must equal the
    value computed by the reference 2D value-noise (bilinear over
    `hash2` at integer lattice; state the exact formula in the source comment).
  - `sandAlbedo(c, r)` → `{r, g, b}` in [0,1]: base `#c9b58c` ± 12% from
    `valueNoise`, plus a faint 1-cell grid darker line (factor 0.94) when
    `min(c%1, r%1)` is within 0.04 of 0 (cell edges).
  - `wallColor` = `#8d8778`; `FLOOR_SIZE = GRID * TILE = 20`.
- `js/world/environment.js`:
  - `makeEnvTexture(canvasOrCtx)` → builds a 2x2 vertical-gradient sky
    (top `#bfe4ff`, horizon `#ffe9c8`) on an injected 2D context (mockable in
    Node), wraps in `THREE.CanvasTexture`; `bakeScene(envTex, pmrem)` →
    `pmrem.fromEquirectangular(envTex)` texture (R-WORLD-01).
  - `lights(scene, shadowSize)` → adds **exactly** (R-WORLD-01):
    `HemisphereLight(0xbfd9ff, 0x8a7f6a, 1.0)` and
    `DirectionalLight(0xffe6c0, 2.2)` at (12, 18, 8), target (0,0,0),
    `castShadow = true`, shadow camera ortho ±13 (top/bottom/left/right),
    near 4 far 40, `shadow.mapSize.set(shadowSize, shadowSize)`. Returns
    `{ hemi, sun }` (for test inspection / later removal).
- `js/world/floor.js`:
  - Pure `floorTexturePixels(size)` → Float or typed array of
    `sandAlbedo` per pixel at `size×size` (default 512); Node-testable exactly
    (oracle pixels at (0,0), center, and a grid-line cell).
  - `buildFloor(renderer)` → `Mesh(PlaneGeometry(FLOOR_SIZE, FLOOR_SIZE),
    MeshStandardMaterial({ map: <CanvasTexture from floorTexturePixels>,
    roughness 0.92, metalness 0.02, envMapIntensity 0.5 }))` rotated -90° X,
    `receiveShadow = true`.
- `js/world/walls.js`:
  - `buildWalls()` → group of 4 boxes (thickness 0.4, height 0.5) centered just
    outside the grid: inner face at ±10.2 (i.e. box centers at ±10.4), lengths
    20.8; positions `(+10.4, 0.25, 0)`, `(-10.4, 0.25, 0)`,
    `(0, 0.25, +10.4)`, `(0, 0.25, -10.4)`; `MeshStandardMaterial` with
    `wallColor`, roughness 0.8, `envMapIntensity 0.4`; `castShadow` and
    `receiveShadow` true. Reuses one material instance for all four boxes.
- All four files import only `three` / `three/addons/*` at the top level for the
  *construction* parts; pure math must live in the Node-safe exports above
  (i.e. importing `materials.js` under Node with no three installed for the
  *math-only* symbols is not required — but `tests/environment.test.mjs` may
  import the pure functions from `materials.js` without instantiating anything
  GL-related). Per R-ARCH-01, world modules may import `js/game/core.js` for
  `GRID` only.

## Acceptance And Verification
Gate: task (wave 3). `tests/environment.test.mjs`:
- `valueNoise` oracle: exact value at (0.5, 0.5, 4) for the documented
  salt (compute independently in the test using the same formula — assert
  equality, so any refactor that changes the formula fails).
- `sandAlbedo` at grid-line position differs from interior position by the
  documented 0.94 factor (within 1e-3); base color in the documented range
  (±14% of `#c9b58c`).
- `floorTexturePixels(16)` returns 16*16*3 values, each in [0,1], and the pixel
  at a cell boundary equals `sandAlbedo` × 0.94 (sample two pixels on/near a
  grid line).
- Construction smoke (requires three to be installed — `three` is a normal
  dependency from task 01 onward if you add it; otherwise this sub-test is
  skipped with a clear message, matching R-TEST-01's rule that GL-requiring
  assertions are browser-checklist items): if importable, `lights(scene, 1024)`
  returns exactly two lights with the documented colors/intensities/shadow
  extents; `buildWalls()` returns a group of exactly 4 meshes sharing one
  material.
- No per-frame allocation: none of the exports expose a per-frame method (code-
  review note; construction-only APIs).
