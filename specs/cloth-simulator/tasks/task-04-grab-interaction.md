# Task 04: Grab / stretch / twist interaction
Wave: 4
Depends on: 03
Owns: `js/interact/grab.js`, `tests/grab.test.mjs`
Risk: normal
Requirements: R8 (grab mode), R2 (temp pin semantics via `setTempPin`), R4 prerequisite (stress is created here; tearing itself is Task 05)

## Goal
In grab mode, pressing LMB on the cloth grabs the nearest vertex; dragging pulls it (cloth stretches, folds, wrinkles, swing dynamics visible); releasing lets go. LMB on empty space still orbits the camera (no grab). Scope boundary: no tearing yet (hard pulls just stretch), no hose.

## Contract
- `js/interact/grab.js` exports `class Grab { constructor(dom, camera, sim, mesh) }` with `setModeEnabled(bool)` (grab mode on/off — Task 08's `H` toggle calls this; when disabled, all listeners are no-ops).
- Raycast against `mesh` on `pointerdown` (button 0, primary pointer). Vertex selection: take the intersection's barycentric + face → pick the face vertex nearest the hit point in world space → `sim.setTempPin(i, ...)` initialized to the hit point.
- While dragging: each frame (or on `pointermove`) set the target to the intersection point of the camera ray with a **horizontal plane at the grabbed vertex's current y** (keeps grabbing usable when the pointer moves off the cloth surface); call `sim.setTempPin(i, x, y, z)` each frame. The sim's `setTempPin` must also set `prev[i] = position[i]` at step time so no rocket-jet occurs on release (Task 02 owns that; assert it there and here).
- `pointerup` / `pointercancel` / `pointerleave` → `sim.clearTempPin()`.
- Multi-pointer: only the primary pointer grabs; second pointer on touch may orbit (out of scope to require).
- While a drag is active, `OrbitControls` must be disabled for the LMB rotate (set `controls.enableRotate` false for the duration), so grab-drag ≠ camera-orbit.
- `window.__dbg` extended with `{ grab }`.

## Acceptance And Verification
- [Unit] `tests/grab.test.mjs` tests the plane-solver `targetOnPlane(origin, dir, planeY)` and the nearest-vertex pick function `pickVertex(geo, hitPoint, positions)` as pure exports (no DOM/three): ray-plane intersection returns the expected point for known inputs (including ray parallel to plane → null); `pickVertex` returns the closest corner for a triangle with corners at known positions.
- [Visual/manual] Grab a mid-cloth vertex and pull down/sideways: cloth stretches smoothly following the pointer with elastic lag (Verlet response), folds form; release → cloth swings and settles — R2/R8.
- [Visual/manual] Drag fast and far: large stretch, high fold density, no NaN vertices (check via `?debug=1`: `__dbg.state()` or console — max position magnitude stays `< 50`), and after settling the cloth returns to a coherent sheet (no permanent warping from pure stretch at this strain level).
- [Visual/manual] LMB on empty space: camera orbits, NO vertex is pinned (no cloth jitter).
- [Visual/manual] No console errors during grab cycles (N3).
