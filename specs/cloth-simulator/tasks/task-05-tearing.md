# Task 05: Tearing
Wave: 5
Depends on: 03, 04
Owns: `js/interact/tear.js`, `tests/tear.test.mjs`
Risk: high (shared interface: mutates sim spring state; must not tear at rest; must interact correctly with Task 06's water contribution)
Requirements: R4 (whole), R6 (torn edges block wetness diffusion — verified here in integration), C1 (tear row), C3 (runs inside substep budget)

## Goal
Pulling a grabbed vertex hard rips the cloth: stressed springs past `TEAR_STRAIN` tear, small tears grow under continued stress, and the cloth can split into separate pieces that hang independently. Scope boundary: tearing via pulling only; water-pressure tearing lands in Task 06 on top of this.

## Contract
- `js/interact/tear.js` exports `tearPass(sim, waterImpulseMagnitudes, gain = WATER_TEAR_GAIN)`:
  - For every non-torn spring k: `s_eff = sim.strain(k) + WATER_TEAR_GAIN * avg(mag[a], mag[b])` where `mag` is a per-vertex Float32Array (Task 06 fills it via `sim.drainImpulseMagnitudes()`; pass `null`/zeros for pull-only).
  - If `s_eff > TEAR_STRAIN` → `sim.markTorn(k)`.
  - Check runs once per substep, AFTER `sim.step()` (positions + constraints already applied), so a tear takes effect next substep — matches R4 "next substep" wording.
- `js/main.js` wiring: call `tearPass` between the sim substeps in the C3 loop (two-line change, Task 08 finalizes).
- Hiding torn quads is handled by Task 03's `sync()` (reads `torn`) — this task must not touch the view, except: verify `sync()`'s edge-to-quad mapping uses the same torn flags; no new view code.
- Cascade emerges naturally: tearing redistributes stress; no explicit cascade engine.
- Torn springs never heal in-session; `reset()` only.

## Acceptance And Verification
- [Unit] `tests/tear.test.mjs` (pure, no three): idle sim for 120 substeps → `torn` count stays 0 (no self-tearing at rest — the R2 strain-at-rest `<0.2` bound is the margin to `TEAR_STRAIN=0.35`).
- [Unit] Threshold: move two spring endpoints to 34% strain via direct position writes, run `tearPass` → spring not torn; at 36% → torn on the same call.
- [Unit] Cascade: pin two far-apart vertices via `setTempPin` on opposite edges (or write positions directly) so a structural row is strained; step + tearPass for up to 200 substeps → at least one whole row of structural springs torn, and the resulting sheet splits into two regions: assert that after release, the two halves' mid-vertices diverge in position by `> 0.1 m` over 120 more substeps (independence).
- [Unit] Water contribution: with zero pull strain (s = 0.30, below threshold) and a fake `mag` array where both endpoints have magnitude `0.15`, `s_eff = 0.30 + 0.05*0.15 = 0.3075` < 0.35 → not torn; with `mag = 1.0` → `s_eff = 0.35` boundary — use `mag = 1.1` → torn. Boundary semantics: strictly greater than `TEAR_STRAIN`.
- [Unit] No heal: after tearing, run 240 substeps at rest → `torn` count unchanged.
- [Visual/manual] Grab the middle of the bottom edge, yank down-fast and hold: a tear opens at a point of maximum stress and grows over the next second into a visible hole; shaking the torn cloth separates halves visibly; the hidden quads leave clean holes (no black triangles or one-sided flashes).
- [Visual/manual] Gentle grabbing never tears (repeatability: 10 slow pulls → 0 tears).
