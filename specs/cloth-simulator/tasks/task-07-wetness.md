# Task 07: Wetness — absorption, weight, darkening
Wave: 7
Depends on: 06
Owns: `js/world/wetness.js`, `tests/wetness.test.mjs`
Risk: normal
Requirements: R6 (visual lerp + view wiring; sim-side rules and gravity already exist from Task 02 — this task verifies and integrates), R3 (vertex color path), C1 (wetness row), C4

## Goal
Wet regions of the cloth are visible in place: sprayed areas darken toward the wet color, uneven wetness creates a blotchy pattern, and wet sections sag below their dry neighbors (gravity multiplier from R2, verified end-to-end). Scope boundary: no drying/evaporation for this feature (N4 — wetness persists until page reload).

## Contract
- `js/world/wetness.js` exports `updateWetnessColors(geo, sim, dry = DRY_RGB, wet = WET_RGB)`: writes per-vertex `color = dry + (wet-dry)*w[i]` into the geometry's `color` attribute (`needsUpdate = true`). Pure JS over typed arrays; no allocations; Node-importable.
- Replace the Task 03 dry-color fallback: `js/world/cloth.js`'s `sync()` (or `js/main.js` — Task 08 cleans up which) now calls the real `updateWetnessColors` every frame.
- Gravity behavior is Task 02's `a_y = -9.8*(1+1.5*w[i])` — this task asserts it end-to-end, adds no sim code.
- Diffusion behavior (Torn edges block lateral spread) is Task 02's `addWetness` — this task asserts an integration case where spraying one side of a wide tear does NOT wet the other side across the gap (R6 + R4 synergy).

## Acceptance And Verification
- [Unit] `tests/wetness.test.mjs` (pure): `updateWetnessColors` on a stub geo (plain Float32Array attribute holder, no three import): `w=0` → color == DRY_RGB exactly; `w=1` → WET_RGB exactly; `w=0.5` → midpoint per channel; buffer updated in place (same attribute array identity, `needsUpdate` flag set).
- [Unit] Sim integration, Node-only, real `ClothSim`: fully soak one vertex region to `w=1` vs. a dry symmetric region; after 240 substeps the wet region's mean y is lower than the dry region's by ≥ 0.05 m (weight → sag; N2 gravity multiplier works at runtime).
- [Unit] Torn-edge block, Node-only: tear all structural springs between two adjacent vertex columns, `addWetness` on one side → the far side's `w` stays 0 after 10 additions (lateral spread blocked).
- [Visual/manual] Spray one corner for ~2 s: that corner visibly darkens (gray-blue), the wet boundary is soft (diffusion gradient) and uneven; stop spraying → dark region persists (no decay) and sags visibly below the dry sheet.
- [Visual/manual] Spray across a torn hole: the far side stays noticeably drier/lighter than the near side (blocked diffusion visible through the color difference).
