# Task 08: Polish + final integration
Wave: 8
Depends on: 07
Owns: `js/main.js`, `results/screenshots/cloth_*.png`, `results/impl_log/milestone-08-polish.md`
Risk: normal (integration gate; low new-logic risk)
Requirements: R8 (mode toggle end-to-end, cursor, hint — all wiring), N1, N2 (hot-path review), N3, N4, C3 (loop final shape), README final gate

## Goal
The whole sandbox works as one experience: grab → tear → spray → wet/sag, from a clean reload, with no console errors, at 60 fps, and with `?debug=1` screenshots saved at each stage. Finalizes all `js/main.js` wiring (mode state, keyboard, debug hook, frame loop) and records the impl log + screenshots.

## Contract
- `js/main.js` final pass (owned end-to-end here):
  - Mode state `mode ∈ {'grab','hose'}`; `H` toggles it: enables/disables `grab.setModeEnabled` and `water.setActive` (active = hose mode + LMB held), swaps cursor (`grab` ↔ `crosshair`), no other side effects.
  - Frame loop matches C3 exactly: clamp dt to 50 ms; `controls.update()`; sim accumulator (`DT_SUB`, max `DT_SUB_MAX` substeps, drop excess); `tearPass(sim, waterMagnitudesSubstep)` between substeps (the per-substep dividing of the frame-level water magnitudes documented in Task 06 is implemented here); `clothView.sync()`; `water.update(dt)`; `controls` damping.
  - `?debug=1` hook complete: `window.__dbg = { sim, clothView, grab, water, scene, camera, renderer, state() }` where `state()` returns `{ mode, tornCount, wetMax, simTime }`. `P` → `POST /save` as in Task 01.
- No feature-level HUD additions beyond the existing R8 hint (no score/objective, R8).
- Screenshot script (manual execution per final gate) uses `?debug=1` + `P` and saves to: `cloth_01_idle.png`, `cloth_02_fold.png`, `cloth_03_torn.png`, `cloth_04_spray.png`, `cloth_05_wet.png`.
- `results/impl_log/milestone-08-polish.md`: decisions, perf numbers (average + p95 frame time at default settings, measured over ~5 s with `?debug=1` timing or the browser), any N1 tuning applied (per R1 tuning note: `N_CONSTRAINTS → 3` / `HIT_R → 0.04` only if needed), N2 hot-path review verdict, and the unverified list (anything not checked).
- Update the spec README status table to `complete` for all tasks as gates pass; replace the `Execution checkpoint` section (not accumulate).

## Acceptance And Verification
- [Integration] The full README final-gate sequence passes from a hard reload: orbit/pan/zoom → grab & fold → tear → ≥ 2 s spray (darken + sag + tear widening) → reload shows dry intact cloth (N4).
- [Visual/manual] Cursor swaps on `H`; hint text matches R8 verbatim; nothing in the UI implies scoring/objective.
- [Perf] (N1) 60 fps baseline with idle cloth; ≥ ~50 fps during hose spray + a torn, partially wet cloth on a mid-range 2020 machine. Record numbers in the impl log; if short, apply the R1 tuning order and re-measure.
- [Quality] (N3) Browser console empty of errors across the whole scenario, without `?debug=1`.
- [Review] (N2) Inspection of `js/core/cloth.js` + `js/world/water.js` hot paths confirms no per-frame allocations in substep/update loops (or the water test's heap probe passed); record verdict.
- [Evidence] All five screenshots exist in `results/screenshots/` and are attached in the impl log; spec status table fully `complete`.
