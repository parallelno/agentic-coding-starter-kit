# Task 06: Water hose spray
Wave: 6
Depends on: 05
Owns: `js/world/water.js`, `tests/water.test.mjs`
Risk: normal (perf-sensitive but contained; allocation discipline in N2)
Requirements: R5 (whole), R4 (water pressure tear contribution via `waterImpulseMagnitudes`), R6 (`addWetness` call sites), C1 (water row), N2

## Goal
In hose mode, holding LMB sprays a visible stream of water from the camera-attached nozzle; water deforms the cloth (dimpling), knocks it around, wets hit vertices, and — via Task 05's tear path — widens existing tears under sustained spray. Scope boundary: wetness *visuals/weight* are Task 07; this task only produces wetness values and impulses.

## Contract
- `js/world/water.js` exports `class WaterHose { constructor(camera, sim, scene) }` with `setActive(bool)` (hose mode + pointer-down), `update(dt)` (called from the C3 loop with the render delta), and getters for debug.
- Nozzle: child of the camera at local offset `(0.30, -0.22, -0.55)`, rotated 20° forward-down; a small visual cylinder + torus (`0x1e2126`) — cosmetic only. Emission origin `nozzleTip` = world position of local `(0, 0, -0.1)`.
- Ring buffer of `WATER_MAX=1024` slots: `{pos: Float32Array(3*WATER_MAX), life: Float32Array, alive: Uint8Array, write: int}`. No per-frame allocations.
- Emission: while active, `RATE=900` particles/s with an accumulator (carry fractional particles across frames); velocity `V_nozzleDir * WATER_SPEED(6.5)` + Gaussian-ish jitter σ `WATER_JITTER(0.25)` (a cheap Box–Muller or sum-of-two-uniforms is fine — document choice in code); lifetime `WATER_LIFE(1.5) s`.
- Integration per `update(dt)`: `v.y += GRAVITY*dt` (store per-particle velocity), `p += v*dt`; kill if `life <= 0` or `p.y < 0` (floor) — recycle the slot.
- Cloth hits (per live particle, per frame, NOT per substep — spray impact is a per-frame event; the tear path still sees per-substep drain, so water-induced tears register on the next substep): broadphase = coarse 12×9 grid over the cloth AABB rebuilt once per frame (vertex → cell map as Int32Array, pre-allocated); for the particle's cell, test neighbors within `HIT_R=0.06 m` of the closest candidate vertex. On hit: kill particle, `sim.applyImpulse(i, vx*dt*IMPULSE_K, vy*dt*IMPULSE_K, vz*dt*IMPULSE_K)` and `sim.addWetness(i, WET_ABSORB_PER_HIT)`.
- After the hit pass, expose per-vertex magnitudes for Task 05: write `this.impulseMagnitudes: Float32Array(vertCount)` (accumulates `|impulse|` this frame); `tearPass` (Task 05, already wired to drain via `sim.drainImpulseMagnitudes()`) consumes it. **Coordination:** Task 05's `tearPass(sim, mag)` is called each substep; the frame-level water magnitudes must be converted into per-substep values by dividing by the number of substeps run that frame before `drain` — document the exact hand-off in a comment in `js/main.js` (owned by Task 08).
- Rendering: one `THREE.Points` with a `BufferGeometry` (dynamic `position` + per-particle `alpha` via `PointsMaterial` opacity is not per-particle — instead use `sizeAttenuation` + cull dead slots by writing `pos.y = -1e6`; document the trick). `PointsMaterial({ size: 0.03, color: 0x9fd0ff, transparent: true, opacity: 0.85 })`.
- `window.__dbg` extended with `{ water }`.

## Acceptance And Verification
- [Unit] `tests/water.test.mjs` with a **mock sim** (plain object exposing `applyImpulse`/`addWetness`/`drainImpulseMagnitudes` + `positions`): run the pure-emission + integration core (export `emissionCore` / `stepCore` functions, no three import): 900±50 spawns per simulated second over 5 s; every particle lands within `WATER_LIFE ± 0.02 s`; a particle aimed at a mock vertex at distance `< HIT_R` kills the particle and the mock receives exactly one `applyImpulse` with magnitude `≈ |v|*dt*IMPULSE_K` and one `addWetness(..., WET_ABSORB_PER_HIT)`; miss → no calls. Heap probe (if `--expose-gc` available): 2000 `update` calls while spraying do not grow retained heap measurably; otherwise the assertion is by inspection of the hot path (no `new` inside the loop) — record which in the impl log.
- [Visual/manual] Switch to hose mode (`H`), hold LMB: a visible blue stream arcs from the nozzle and hits the cloth, which dimples and sways toward the spray; releasing stops the stream within one frame.
- [Visual/manual] Aim at an existing tear and hold ≥ 1 s: the tear visibly widens (R4 water-pressure contribution) even without pulling.
- [Visual/manual] Spray the floor: particles die at the floor line, no visible stream below `y=0`, no flicker; `?debug=1` → `__dbg.water` shows live count ≤ `WATER_MAX` and no NaN positions.
- [Visual/manual] No console errors; FPS remains ≥ ~50 with the default camera distance (N1).
