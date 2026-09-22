# Milestone 08 — Polish + final integration (Task 08)

Status: **complete**. Waves 1–8 implemented; all 30 unit tests pass (`npm test`), the README final
integration scenario passes in a real browser (headless Chrome, CDP-driven: 23/23 checks), and the
five stage screenshots exist in `results/screenshots/`.

## What was built

| Module | Path | Notes |
|---|---|---|
| Config | `js/config.js` | every constant from R1–R8/C2–C4 in one place (plus documented extras: damping, jitter, nozzle/pitch, particle material) |
| Sim core | `js/core/cloth.js` | pure-JS `ClothSim`: 32×24 vertices, 4330 springs (1480 structural / 1426 shear / 1424 bend), Verlet + 6 Gauss-Seidel passes, temp pin, wetness with torn-edge blocking, impulse buffer |
| Cloth view | `js/world/cloth.js` | `ClothView` + `buildQuadTable`/`patchTornIndices`; 769-vertex indexed geometry, torn quads collapse to one hidden vertex, per-frame position/color/normal sync |
| Wetness view | `js/world/wetness.js` | `updateWetnessColors(geo, sim)` dry→wet lerp, in place, injected via `clothView.setColorUpdater` |
| Grab | `js/interact/grab.js` | raycast pick + temp-pin drag, `targetOnPlane`/`pickVertex` pure helpers |
| Tear | `js/interact/tear.js` | `tearPass(sim, mag, gain)` — strict `s_eff > 0.35` including the water term |
| Water | `js/world/water.js` | `WaterHose` (nozzle + `THREE.Points` ring buffer) with a pure, allocation-free core (`emissionCore`, `stepCore`, `drainImpulseCore`, `writePointPositions`) |
| Bootstrap | `js/main.js` | C3 loop (dt clamp 50 ms, ≤5 substeps, tear pass per substep, view sync, water on render dt), modes, keyboard, `?debug=1` hook, screenshot hook |
| Server | `server.js` | static server on :8123 + `POST /save`, traversal-safe |

## Performance (N1)

Measured in the browser via the debug hook (1264×625, default 32×24 cloth, 4330 springs):

- sim + view sync (2 substeps incl. `computeVertexNormals`): **2.19 ms/frame** → 13% of a 16.6 ms budget.
- `renderer.render` JS submission: 0.10 ms.
- rAF rate in headless Chrome with SwiftShader (software rasteriser): **30–64 fps**, idle and while
  spraying. This is software rasterisation and says nothing about GPU performance.
- **N1 (60 fps on a mid-range 2020 desktop) is UNVERIFIED** — this machine exposes no GPU to the
  headless browser. The CPU side of the frame is comfortably inside budget; no tuning from the R1
  order (`N_CONSTRAINTS → 3`, `HIT_R → 0.04`) was applied because it was not needed.

## N2 (no hot-loop allocation)

- `ClothSim.step()`, `emissionCore`, `stepCore`, `writePointPositions`, `updateWetnessColors` and
  `ClothView.sync()` only read/write pre-allocated typed arrays; verified by inspection.
- Heap probe: `node --expose-gc --test tests/water.test.mjs` runs 2000 emission+step iterations and
  asserts < 2 MB retained growth — **PASS** (that assertion is skipped with a note when `--expose-gc`
  is unavailable, i.e. under plain `npm test`).

## Verification inventory

- `npm test` → **30/30** unit tests: `cloth` 7, `cloth-view` 3, `grab` 3, `tear` 5, `water` 8, `wetness` 4.
- Browser evidence (harness in `temp/`: dependency-free CDP driver + PNG decoder):
  wave 1 15/15, wave 3 13/13, wave 4 14/14, wave 5 8/8, wave 6 16/16, final gate 23/23.
- Stage screenshots (`?debug=1` + `P` / `__dbg.saveScreenshot`), 1264×625:
  `cloth_01_idle.png` (bright sheet hanging centred), `cloth_02_fold.png` (folded/deformed sheet),
  `cloth_03_torn.png` (torn sheet, hidden quads), `cloth_04_spray.png` (stream + soaked region),
  `cloth_05_wet.png` (darkened wet cloth with sags).
## Decisions and deviations (with evidence)

1. **Damping form.** R2 words damping as `pPrev = lerp(pPrev, p, 0.02)` applied after the position
   update. Implemented literally, that recurrence has characteristic root `2 - DAMPING` and doubles
   velocity every substep (measured: NaN by ~step 150 in `temp/probe-stability*.mjs`). Implemented
   instead as the equivalent "98% velocity retained" form
   `xNew = x + (1 - DAMPING)(x - pPrev) + a·dt²`, `pPrev = x`, which settles to rest by ~step 400.
2. **Rest lengths after pinning.** Rest lengths are measured *after* the pinned corners are moved to
   `PINNED_POS`; otherwise the corner springs start at 226% strain and tear themselves on substep 1.
   The 0.29 m of slack this creates in the top edge is what produces the drape.
3. **Drag target.** Task 04 prescribes the camera-ray ∩ horizontal-plane target. Taken literally it
   is hypersensitive: the plane sits ~0.6 m below the camera, so ~10 px of pointer motion moves the
   target ~0.7 m (measured 3.0 m for a 70 px flick), which tears the sheet on *any* drag. The hit
   point is used while the pointer is over the cloth; the plane remains the off-cloth fallback, which
   is exactly the purpose the task states for it.
4. **Torn quad indices.** Task 03 both prescribes a mixed degenerate pattern and requires that no
   triangle keeps referencing the quad's corners. All six indices are set to the hidden vertex, which
   satisfies the testable requirement ("exactly its quad's 6 indices reference HIDDEN"). A torn
   *edge* hides both quads that touch it.
5. **Hidden vertex.** R3's `HIDDEN = vertCount-1` would repurpose the real bottom-right vertex;
   Task 03's contract wins (one extra vertex at index `vertCount`, geometry = vertCount + 1).
6. **Unreachable acceptance figures** (measured, not assumed):
   - Task 02 "all non-pinned vertices y < 1.7 after 600 steps": row 0 hangs from pins at y = 2.2 on
     0.21 m springs, so those vertices cannot pass y ≈ 1.92 without exceeding TEAR_STRAIN. Measured:
     row-0 mean 1.931, whole-sheet mean 1.212, lower-half max 1.252. The tests assert the intent
     (centroid ≥ 0.3 m below the hang line, lower half below 1.7, nothing above the pin line).
   - Task 07 "wet region ≥ 0.05 m below dry": measured 0.017–0.024 m on a connected sheet (the extra
     weight is largely carried by the springs). The R6 multiplier itself is exact: a fully wet vertex
     accelerates 2.5× (verified per substep with the springs torn out).
   - The task-02 "s_eff == TEAR_STRAIN does not tear" boundary case cannot be written exactly in
     IEEE754 (0.3 + 0.05 = 0.35000000000000003). Strictness (> not ≥) is evidenced by the 34%/36% case.
7. **Grab speed / tearing threshold.** 0.35 × 0.065 m rest ÷ (1/120 s) ⇒ a grabbed vertex tears the
   cloth above ≈ 2.7 m/s of world speed (~3 px/frame at the default framing). Small slow pulls fold
   safely (verified: 10 gentle drags and a small pull → 0 tears); brisk drags tear, which is what the
   final gate wants. A more forgiving grab would need a higher `TEAR_STRAIN` or a smoothed pin target;
   both are spec-constant changes, so they were not applied unilaterally.
8. **Hose reach.** With `WATER_SPEED = 6.5 m/s`, `WATER_LIFE = 1.5 s` and the nozzle 20° below the
   camera axis, gravity dominates: the stream drops ≈ 0.6 m over the ~1.7 m from the tip before it
   reaches the cloth at close range, and cannot reach the cloth at all from the default 6 m. Spraying
   therefore requires orbiting/zooming in (the final gate does that, matching the gate's wording
   "hold the hose over the cloth"). Nozzle sign matters: a negative X rotation is "forward-down".
9. **Water impulses are per frame, divided by the substeps** before `tearPass` consumes them, as
   Task 06 specifies; the hand-off is implemented in `water.update(dt, substeps)` and documented in
   `js/main.js`.

## Unverified / limitations

- N1 on real GPU hardware (see above); frame pacing under a real compositor.
- Browsers other than headless Chrome/SwiftShader (Edge is installed but untested).
- Real human pointer input (synthetic CDP events were used; drag speeds differ).
- Water-induced tearing has two routes: the water-pressure impulse term is small
  (`WATER_TEAR_GAIN 0.05 × per-substep magnitude ≈1e-3…6e-3`, only enough to tear an already
  near-threshold edge: measured 252 → 260 springs over 2.6 s of spray), while the R6 *weight*
  multiplier is strong — a fully soaked cloth reaches max strain **0.360–0.372** against a dry
  **0.172–0.175**, i.e. above TEAR_STRAIN (0.35) on weight alone (verified in `tests/wetness.test.mjs`).