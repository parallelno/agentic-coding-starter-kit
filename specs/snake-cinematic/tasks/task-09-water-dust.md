# Task 09: Water pond visual + environmental dust + food-burst pool
Wave: 4
Depends on: 02, 06
Owns: `js/world/water.js`, `js/world/dust.js`, `tests/effects.test.mjs`
Risk: normal (visual; the *hazard* behavior is in core — this task is the
look only, but both use `isWet` from core as the single source of truth)
Requirements: R-WORLD-02 (visuals), R-WORLD-06, R-PERF-01 (dust counts),
R-PERF-04, R-ARCH-01

## Goal
A living water pond (transparent circular mesh + foam ring + slow normal
shimmer) and two preallocated `THREE.Points` particle systems (drifting
environmental dust; pooled food-eat bursts) — all math pure and Node-testable,
no per-frame allocation.

## Contract
- `js/world/water.js`:
  - Pure:
    - `waterCenterWorld()` → `cellToWorld(14, 14)` = `{x: 4.5, z: 4.5}`;
      `waterRadiusWorld()` = `POND_R * TILE = 3.0`.
    - `foamRingSegments(count = 64)` → array of `{x, z}` points on the circle at
      radius `3.0 + 0.15` (foam sits just outside the wet boundary) around
      (4.5, 4.5), evenly spaced, index 0 at angle 0.
    - `shimmerOffset(tSec, i, count)` → per-foam-vertex radial offset
      `0.03 * sin(2π * 0.5 * tSec + i * 2.4)` (deterministic, per-vertex phase
      from index); document oracle at (t=0, i=0) = 0 and (t=0.5, i=1).
  - `buildWater(scene)` → circular `Mesh(CircleGeometry(3.0, 48),
    MeshStandardMaterial({ color 0x2e8ea8, transparent, opacity 0.55, roughness
    0.08, metalness 0.15, envMapIntensity 0.8 }))` at (4.5, 0.02, 4.5) rotated
    -90° X (sits just above the floor to avoid z-fighting); plus a foam
    `Mesh(RingGeometry(3.0, 3.3, 48)` … or a `Line` loop) with a pale `#eaf6fb`
    material, opacity 0.8, at y 0.03. No light.
  - `updateWater(tSec)` → animates the shimmer (either a per-vertex vertex
    displacement on the foam ring, or a cheap material emissive/opacity pulse —
    pick one, keep it allocation-free and ≤ a few dozen ops per frame).
- `js/world/dust.js`:
  - `DustSystem`:
    - `attach(scene, count, seed)` → preallocated `BufferGeometry` with `count`
      positions inside a box `x,z ∈ ±12, y ∈ 0.2..9` above the arena, and a
      module-level generated soft-blob sprite texture (8×8 radial gradient on a
      small canvas — injectable in Node for the math test); `PointsMaterial({
      size 0.14, transparent, opacity 0.35, depthWrite false, blending
      Additive, map <sprite> })`.
    - `velocities` are preallocated per-particle from `seed` (deterministic:
      `seededRng`-style hash by index — document the formula; drift
      `vx,vz ∈ ±0.15 u/s`, `vy ∈ -0.05..-0.2 u/s`).
    - `updateDust(dtSec)` → integrate positions, wrap: `y < 0.2 → y = 9`;
      `|x| > 12 → x = -sign(x)*12`; same for `z`. All in place, no realloc.
  - `BurstSystem`:
    - `attach(scene, poolSize = 48)` → one `Points` with `poolSize` slots,
      `additive`, `0.6 s` lifetime per slot; `life[i]` preallocated.
    - `emitBurst(c, r)` → fills all slots at `cellToWorld(c, r)` with random
      outward velocities (injected rng; deterministic), `life[i] = 0.6` each,
      `points.visible = true`.
    - `updateBurst(dtSec)` → integrate active slots with small gravity
      `vy -= 1.5 * dt`; when `life[i] <= 0` → slot inactive; when all inactive →
      `points.visible = false`. Position/alpha updated in place (position
      buffer + a per-slot alpha via `material.opacity` on the whole pool or a
      custom attribute — keep it preallocated).
- Both files import only `three`, `three/addons/*`, and `js/game/core.js`
  (`isWet`, `cellToWorld`, `POND_*`, `GRID`, `TILE`).

## Acceptance And Verification
Gate: task (wave 4). `tests/effects.test.mjs`:
- `waterCenterWorld` = (4.5, 4.5); `waterRadiusWorld` = 3.0; `foamRingSegments(8)`
  index 0 = (4.5+3.15, 4.5), index 2 = (4.5, 4.5+3.15) (within 1e-6).
- `shimmerOffset(0, 0, 64)` = 0 (within 1e-9); `shimmerOffset(0.5, 1, 64)` =
  `0.03 * sin(π + 2.4)` (within 1e-6) — pinned to the formula.
- `DustSystem` with `count = 80, seed = 7`: two instances with the same count+
  seed produce identical initial positions (determinism); after
  `updateDust(1.0)`, every position is still inside the wrapping box and the
  preallocated buffer length is unchanged (`geometry.attributes.position.array.
  length === 80*3` before and after).
- `DustSystem` wrap: a particle starting at `y = 0.3` stepping
  with `vy = -0.1` for 10 s wraps to `y = 9` at least once (assert via the
  public position buffer, not internals).
- `BurstSystem.emitBurst(10, 8)` → all 48 slots positioned at (0.5, y0, -1.5)
  (y0 documented, e.g. 0.45) at t=0; after `updateBurst(0.61)` all slots
  inactive and `points.visible === false`; a fresh `emitBurst` re-arms it.
- No per-frame allocation: `updateDust`/`updateBurst` do not grow the
  `position.array` and construct no new `Points`/`BufferGeometry` (proxy
  constructor count or code-review note — prefer executable where feasible).
