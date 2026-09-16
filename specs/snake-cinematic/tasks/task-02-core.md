# Task 02: Core snake rules (pure logic)
Wave: 1
Depends on: none
Owns: `js/game/core.js`, `tests/core.test.mjs`
Risk: high — shared pure logic every other layer consumes
Requirements: R-CORE-01..06, R-WORLD-02 (wet predicate), R-ARCH-05 (shared snapshot shape),
R-ARCH-06

## Goal
A zero-dependency module implementing the full deterministic snake state machine
exactly per the §2 shared contract in `requirements.md`.

## Contract
Exports (exact names/behaviors):
- Constants: `GRID = 20`, `TILE = 1.0`, `TICK_MS = 160`, `POND_FACTOR = 0.45`,
  `TICK_FLOOR_MS = 60`, `MAX_BUFFER = 2`, `POND_CX = 14`, `POND_CY = 14`, `POND_R = 3.0`.
- `cellToWorld(c, r)` → `{ x: c - 9.5, z: r - 9.5 }`.
- `isWet(c, r)` → `(c-14)^2 + (r-14)^2 <= 9`, out-of-range cells `false`.
- `createGame({ rng } = {})`:
  - state: `{ snake: [...head first, each {c, r, pond}], direction, food, score, alive,
    won, state }` with `state` in `menu|playing|paused|dead` and `won` boolean, initial
    snake of length 3 centered heading north (head `{c: 10, r: 8}`, body behind),
    `food` from spawn, `score 0`, `alive true`, `won false`, `state 'menu'`.
  - methods: `start()` (from `menu|dead` → fresh layout: re-place snake, recompute pond
    flags, spawn food, `state 'playing'`), `pause()`, `resume()` (`paused` only),
    `turn(dir)` (queues via internal buffer, max `MAX_BUFFER`, no reversal vs. the
    *buffered/active* direction — a queued opposite of the *first* pending turn is
    also rejected), `tick()` (advances one cell; per `R-CORE-02` pond slowdown, `tick()`
    is called by the engine scaled by speed — the core itself applies no timer; see
    `tickIntervalMs(snapshot)`), `state()` → snapshot (deep-ish copy of `R-ARCH-05`
    shape with `won`, and `deathCell` when `dead`),
  - `tickIntervalMs(snap)` → effective ms per step: `base = max(TICK_FLOOR_MS,
    TICK_MS - floor(snap.score / 10))`; `snap.snake[0].pond` ? `base / POND_FACTOR` :
    `base` (documented: pond stretches the step, engine accumulates with this value).
  - eating: head enters `food` cell → score += 10, grow by not popping tail, spawn new
    food. If `food` is `null` and there is any non-snake cell → spawn; if none →
    `won = true, state 'dead', alive false` (win, not death: `deathCell` null,
    `won` true in snapshot/event).
  - death (R-CORE-04): wall (next cell out of 0..19) or body collision; tail cell
    vacated this tick is free when not growing. On death: `alive false`,
    `state 'dead'`, `deathCell` = the cell the head would have entered (for camera).
  - spawn: uniformly random **dry** cell (not `isWet`, not snake-occupied); iterate
    `rng()` until eligible; guard: after 1000 rng draws without success, scan the
    full grid in fixed order for an eligible cell (deterministic fallback); if none
    → win per above.
- Module must not import node builtins, DOM, or three.

## Acceptance And Verification
Gate: task (wave 1). All cases in `tests/core.test.mjs`:
- Movement: N ticks with no turns → head position follows heading; pond cell on the
  path does not change the path (only `tickIntervalMs`).
- Buffer: queue 2 valid turns, tick twice, path turns on successive ticks; queue a
  3rd → ignored; reversal (180°) ignored; reversal vs. *first buffered* turn ignored.
- Growth/eat: place snake adjacent to forced food (drive rng via `seededRng`-style
  injected stub), tick into it → length+1, score 10, new food not on snake/wet.
- Score/speed: `tickIntervalMs` (dry head) = 160 at score 0, 160 at score 9, 159 at
  score 10, 158 at score 20, 150 at score 100, exactly 60 at score 1000 and at any
  larger score (floor clamps); pond case = base / 0.45 (e.g. score 0 → 160 / 0.45).
- Death: wall collision sets `state 'dead'`, `deathCell` correct; self-collision
  after a tight U-turn kills; tail-vacate: entering the cell the tail just left while
  NOT growing is safe.
- Win: injected rng stub that makes spawn impossible + full-board snake stub →
  `won true`, `state 'dead'`, `alive false`, `deathCell` null.
- Determinism: same rng stub sequence → identical first 20 head positions and food
  cells (two `createGame` instances).
- Dry-spawn: with a stub rng returning a fixed stream, assert every spawned food is
  not `isWet` and not on the snake.
