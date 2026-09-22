# Task 02: Cloth simulation core (pure JS, no three.js)
Wave: 2
Depends on: —
Owns: `js/core/cloth.js`, `tests/cloth.test.mjs`
Risk: high (shared interface: R3/R4/R5/R6/R7/R8 all consume this API; correctness of Verlet + tearing hinges on it)
Requirements: R2 (whole), C1 (`ClothSim` row), C2 (full sim API), R4 (spring bookkeeping, strain, tear removal — the tear *trigger* from interaction is Task 05 but `markTorn(i)` and `strain(i)` live here), R6 (storage + `addWetness` rules, incl. torn-edge block), R1 (dimensions/pins/initial layout)

## Goal
A standalone `ClothSim` class importable in Node (`node_modules` not required by this module) that simulates a COLS×ROWS cloth with pins, springs, Verlet integration, tearing bookkeeping, and wetness, matching every number in `requirements.md` R2/C2/R6. Scope boundary: rendering, input, and water are out of scope; the class is driven by `step(dt)` and the few methods listed below.

## Contract
- Factory/constructor: `new ClothSim()` reads constants from `js/config.js` (import the real constants — do not duplicate literals).
- Initial state: vertex `i = row*COLS + col` sits on a vertical plane at `z ≈ 0`, with row 0 at the TOP (highest y, where the pins are): `x = -CLOTH_W/2 + col*(CLOTH_W/(COLS-1))`, `y = CLOTH_Y - row*(CLOTH_H/(ROWS-1))` — so `y ∈ [CLOTH_Y - CLOTH_H, CLOTH_Y]` and row = ROWS-1 is the bottom edge. Each vertex gets uniform random z jitter `< 0.005 m`. `prev` = initial position. `invMass[0]=invMass[COLS-1]=0`, others `1`.
- Springs: structural = all row + column neighbors; shear = both diagonals of each interior cell; bend = skip-one along rows and columns. `rest` = initial Euclidean distance. Springs stored as parallel typed arrays `{a, b, rest, torn}` with `a < b`. Order: structural first, then shear, then bend (so `markTorn` on structurally-important springs is findable; no task depends on exact order except tests).
- `step(dt)`: Verlet with gravity `a_y = -9.8*(1+1.5*wet[i])`, damping `pPrev = lerp(pPrev, p, 0.02)` (velocity retained 98%) applied AFTER the position update; then `N_CONSTRAINTS` Gauss-Seidel passes over non-torn springs only, pinned vertices (invMass 0) never move. Pinned vertices are re-pinned to `PINNED_POS` at the start of each `step`. Note: `step` takes exactly one substep `dt` (caller passes `DT_SUB`); the accumulator lives in Task 01's loop per C3.
- `applyImpulse(i, dx, dy, dz)`: moves vertex i directly by `(dx,dy,dz)` (skip if pinned) and records the magnitude into an internal per-vertex buffer read by Task 05/06 via `drainImpulseMagnitudes()` returning `Float32Array(vertCount)` and zeroing the buffer.
- `addWetness(i, amount)`: `wet[i]=min(1, wet[i]+amount)`; then for each of the up-to-4 ring neighbors not pinned and not separated by a torn structural edge, `wet[n]=min(1, wet[n]+amount*WET_DIFFUSE)` where `WET_DIFFUSE=0.25`.
- `strain(k)`: `(len - rest)/rest` for spring k using live positions.
- `markTorn(k)`: sets `torn[k]=1`; irreversible for the session.
- `setTempPin(i, x, y, z)` / `clearTempPin()`: one-slot override used by Task 04 grab; during a step the temp-pinned vertex is held at the target instead of integrating (it is NOT added to invMass; the constraint solver simply skips moving it). Only one temp pin at a time; second call replaces the first.
- `reset()`: restores initial layout (with fresh random jitter), clears `torn`, `wet`, temp pin, impulse buffer.
- No three.js import; no allocations per `step` other than none (all scratch pre-allocated).
- Tests live in `tests/cloth.test.mjs`, run via existing `npm test`.

## Acceptance And Verification
- [Unit] Pinned immobility: after 600 `step(DT_SUB)` calls with no input, `positions[PINNED_IDS[k]] === PINNED_POS[k]` exactly, and all non-pinned vertices have `y < 2.0 - 0.3` (cloth draped down below the hang line, no explosion: max `|p| < 50`).
- [Unit] Drape sanity: after settling (600 steps), the bottom-row average y is below the middle-row average y by at least `0.3 m`, and the cloth's max strain (pre-tear check, no forces) `< 0.2` at rest.
- [Unit] Substep behavior: `step` mutates state only by the gravity-dominant motion in one call — after 1 `step`, a free (unclamped) non-pinned vertex has fallen `> 0` and `< 1 mm` (gravity·dt² at dt=1/120 is ≈ 0.68 mm, so this band catches order-of-magnitude errors and integration blowups).
- [Unit] Impulse: `applyImpulse(i, 0, 0.01, 0)` moves exactly that vertex +0.01 in y (pinned target → no move) and `drainImpulseMagnitudes()[i] === 0.01`, buffer zeroed after drain.
- [Unit] Wetness: `addWetness` caps at 1.0; ring neighbors each gain `amount*0.25`; a torn structural edge blocks diffusion across it (assert exactly 3 neighbors receive spread in a case with 1 torn edge).
- [Unit] Strain/tear: manually move two vertices 40% apart along a spring, `strain(k) > 0.35`; `markTorn(k)` removes it from constraint influence (after tearing, a second vertex 2 m away held by only that spring drifts — assert position diverges after 60 steps). `reset()` restores `torn` all zero and `wet` all zero.
- [Unit] No three import: `node -e "import('./js/core/cloth.js')"` succeeds without `node_modules` installed.
