# Task 03: Cloth rendering + sim integration
Wave: 3
Depends on: 02
Owns: `js/world/cloth.js`, `tests/cloth-view.test.mjs`
Risk: normal
Requirements: R1 (material), R3 (whole), R6 (color lerp — calls into Task 07's `updateWetnessColors`, but the attribute plumbing and `vertexColors: true` land here), C1 (`ClothView` row), C3 (sync point in loop)

## Goal
The cloth is visible in the browser: a white bed sheet hangs from its two top corners, sways into a natural drape on load, and the render loop keeps it in sync with `ClothSim`. Scope boundary: grab/tear/wetness visuals beyond the dry→wet lerp of R6 are later tasks.

## Contract
- `js/world/cloth.js` exports `class ClothView { constructor(sim) }` plus `sync()` (per-frame) and a `mesh` getter.
- Geometry: indexed `BufferGeometry`, `vertCount = COLS*ROWS`; `position` and `color` BufferAttributes (dynamic usage), `index` built once from the quad→2-triangle pattern with an extra degenerate vertex: append one vertex at index `vertCount` positioned at the cloth center that serves as the `HIDDEN` target; its color = wet color so hidden quads don't show a flash. Torn-quad hiding per R3: a quad whose 4-edge spring set (the 4 structural springs forming the quad boundary) has any torn spring → its 6 indices rewritten to `[HIDDEN, HIDDEN, HIDDEN, HIDDEN, HIDDEN, HIDDEN]`? No — use `[HIDDEN,HIDDEN,HIDDEN, HIDDEN,HIDDEN,HIDDEN]`-style degenerate triangles: first triangle `[a=qi0, b=HIDDEN, c=HIDDEN]`, second `[a=HIDDEN, b=qi2, c=HIDDEN]` — the exact degenerate pattern is an implementation detail, but after hiding a quad, no triangle referencing that quad's 4 corners may remain. Rebuild rule: `sync()` walks quads each frame (31×23=713 quads, trivial) and patches surviving indices; keep the original index pattern cached at construction for the untouched state.
- Per `sync()`: copy `sim.positions` → `position` attribute; `position.needsUpdate = true`; `geometry.computeVertexNormals()`; color attribute updated via `updateWetnessColors(geo, sim)` imported from `js/world/wetness.js` — **Task 07 owns wetness.js**; to keep this task independently testable, import it lazily and, if the module is not yet present, fall back to a local pure-dry-color fill (all DRY_RGB). Task 07 will replace the fallback wiring in `main.js`/here.
- Material per R1: `MeshStandardMaterial({ color: 0xf5f4ef, side: THREE.DoubleSide, roughness: 0.9, metalness: 0.0, vertexColors: true })`.
- `js/main.js` (owned by Task 01/08 — wiring only): create `new ClothView(sim)`, add to scene, call `clothView.sync()` inside the rAF loop after the sim substeps, and extend `window.__dbg` with `{ sim, clothView }`. Two-line wiring changes to `main.js` are permitted in this task (documented here; final main.js cleanup in Task 08).

## Acceptance And Verification
- [Unit] `tests/cloth-view.test.mjs` runs in Node WITHOUT three.js rendering: test with a minimal `THREE` stub is NOT allowed to mask bugs — instead test the pure index-patcher: export a helper `patchTornIndices(indexArray, quadOrigins, tornByEdge:Set<number>, HIDDEN)` (pure JS, no three import) and assert: untouched cloth → indices identical to original; one torn edge → exactly its quad's 6 indices reference `HIDDEN` and no other quad's indices are touched; restoring untouched sim → indices identical to original again.
- [Visual/manual] Load `http://localhost:8123/` (after `npm ci`): a white sheet hangs from two top corners, initially taut at y≈2.0, settles into a slight drape within ~2 s, sways gently then quiets — R1/R2 visual.
- [Visual/manual] Orbit behind the cloth: both faces render (DoubleSide), no z-fighting, no single-sided holes; zoom to close-up: smooth surface, normals correct (lighting varies with curvature) — R3.
- [Visual/manual] No console errors; 60 fps target with cloth idle (N1/N3 baseline before interactions exist).
