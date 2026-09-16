# Task 08: Food visual (emissive icosahedron + bob/rotate)
Wave: 4
Depends on: 02, 06
Owns: `js/world/food.js`, `tests/food.test.mjs`
Risk: normal
Requirements: R-WORLD-05, R-ARCH-05, R-PERF-04, R-ARCH-01

## Goal
A single emissive icosahedron food marker with a pure bob+rotate pose function
(no dynamic light), driven by the shared snapshot's `food` field.

## Contract
- Pure (Node-importable):
  - `foodPose(tSec, c, r)` → `{ y, rotY }`: `y = 0.45 + 0.08 * sin(2π * 2 * tSec)`
    (2 Hz, ±0.08 world units, rest center 0.45 above floor), `rotY =
    2π * 0.4 * tSec` (slow 0.4 Hz spin). Deterministic in `tSec` exactly.
  - `FOOD_Y_BASE = 0.45`, `FOOD_BOB_AMP = 0.08`, `FOOD_BOB_HZ = 2`,
    `FOOD_SPIN_HZ = 0.4` (constants, documented oracles below).
- `class FoodVisual`:
  - `attach(scene)` → `Mesh(IcosahedronGeometry(0.35, 1), MeshStandardMaterial({
    color 0xffffff, emissive 0xff9f43, emissiveIntensity 1.6, roughness 0.3,
    metalness 0.0, envMapIntensity 0.4 }))`, `castShadow = true`.
  - `update(snapshot, tSec)` (R-ARCH-05): if `snapshot.food` is null →
    `mesh.visible = false`; else position at `cellToWorld(c, r)` with `y` from
    `foodPose`, `rotation.y = rotY`, `mesh.visible = true`.
  - No geometry/material creation in `update`; no light added (R-WORLD-05).
- Imports only `three` and `js/game/core.js` (`cellToWorld`).

## Acceptance And Verification
Gate: task (wave 4). `tests/food.test.mjs`:
- `foodPose(0, 14, 4)` → `{ y: 0.45, rotY: 0 }`; `foodPose(0.25, c, r)` →
  `y = 0.45 + 0.08 * sin(π) ≈ 0.45` (within 1e-4), `rotY ≈ π/2` (within 1e-4);
  `foodPose(0.125, c, r)` → `y = 0.53`, `rotY ≈ 2π*0.4*0.125 = 0.314159...`
  (within 1e-4) — oracle values pinned to the formula above.
- `update` with a `food` snapshot positions the mesh at the cell center with the
  pose's y; with `food: null` sets `visible = false` and does not throw.
- No dynamic light: construction adds zero `Light` objects to the scene (assert
  by scanning `scene.children` if a mock scene is used, else code-review note).
- No per-frame allocation: same rule as snake — `update` reuses the mesh, no
  new geometry/material (proxy constructor count check or code-review note).
