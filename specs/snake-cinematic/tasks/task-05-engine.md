# Task 05: Game engine (deterministic loop, state machine, events)
Wave: 2
Depends on: 02, 03, 04
Owns: `js/engine/engine.js`, `tests/engine.test.mjs`
Risk: high — central state machine and fixed-step clock everything visual consumes
Requirements: R-CORE-05, R-PERF-02, R-PERF-03, R-ARCH-02, R-ARCH-03, R-ARCH-04,
R-ARCH-05, R-SCOPE-03 (playable-first)

## Goal
A Node-runnable engine that owns the fixed-step simulation clock, wires
core + input + sound + leaderboard, and publishes the event bus. Must run a
complete game under Node with mock graphics (no WebGL, no DOM) — this is the
headless contract R-ARCH-02 and R-TEST-02 rely on.

## Contract
- `export class GameEngine` (or `createEngine({ game, input, sound, graphics,
  clock, quality })`) — inject everything; defaults per R-ARCH-03
  (`Math.random`-seeded game, in-memory leaderboard, `'standard'` quality,
  performance-based clock):
  - `clock` shape: `{ now(): ms }` (injectable fake clock for tests).
  - `graphics` shape: `{ size(w, h), render(snapshot) }` (mock counts render
    calls). `renderer`/`composer` come from the real implementation only at
    task 13 (R-ARCH-02) — the engine treats `graphics` opaquely.
- Behavior:
  - `update(dtMs)`: clamp `dtMs` to ≤ 100 ms (R-PERF-02); accumulate; while
    `state === 'playing'`, step the simulation as many whole ticks as the
    accumulator allows at `game.tickIntervalMs(current snapshot)` (pond cells
    stretch the interval per R-CORE-02). Never steps when `menu|paused|dead`.
  - `start()`: if `menu|dead` → `game.start()`, reset accumulator, emit `state`
    (R-ARCH-04 shape). `pause()`/`resume()` guard current state; `resume`
    additionally calls `sound.play('resume')` (R-UI-01, muted-respectfully via
    the backend) and resets the clock baseline so no dt spike (R-PERF-03).
  - `turn(dir)`: always forwards to game (input layer does per-state filtering
    per R-INPUT-01; engine is state-agnostic here). `mute()` → toggle via
    `sound.setMuted(...)`, emit `mute`.
  - Event bus `on(evt, fn) → off()` with exact payloads (authoritative,
    per R-ARCH-04):
    - `state` → `{ ...core snapshot (R-ARCH-05), length: snap.snake.length,
      best, top }` where `top = leaderboard.list().slice(0,3)` and
      `best = top[0].score ?? 0`. Emitted on `start`, `pause`, `resume`,
      entering `dead` (death **or** win), and after every `eat`.
    - `eat` → the `{ c, r }` of the eaten cell (engine detects via before/after
      length diff, or core exposes `lastEat` — implementer's choice, must be
      exactly the eaten cell).
    - `death` → `{ c, r, won }` from the new snapshot; on win `c===null`,
      `r===null`, `won===true`.
    - `mute` → `{ muted: sound.isMuted() }`.
  - On entering `dead` (loss **or** win): submit `score` via the leaderboard
    **before** emitting `state`, so `top`/`best` include the final run.
  - The core's `snap.won` wins over `snap.alive` for any decision; never mutate
    the core snapshot object (emit copies).
- No browser APIs; Node-importable; no `three` import (engine drives graphics
  opaquely).

## Acceptance And Verification
Gate: task (wave 2). `tests/engine.test.mjs` (fake clock + mock graphics +
stub input sound spy + `seededRng`):
- Fixed-step: with fake clock stepping 50 ms × 4, `update(50)` called 4 times at
  score 0 (160 ms interval) → exactly **one** `update`-visible tick boundary
  crossed (length unchanged, head advanced one cell) after the 4th call, none
  earlier (assert via a head position or a spy on a core hook) — i.e. no
  partial-tick drift.
- Pond stretch: force a pond cell under the head (via a scripted
  `turn` sequence against seeded rng, or by exposing a test hook that returns
  the next tick interval) → `game.tickIntervalMs()` for that step is
  `160/0.45` and the engine takes twice as long (in fake-clock ms) to cross the
  same pond-cell tick boundary as a dry one.
- Pause: `pause()` → `update` over 10 fake-seconds causes no head movement and
  no `eat`/`death`/`state` events; `resume()` → next `update(160)` ticks exactly
  once.
- Start from `dead`: `start()` resets `score 0`, `length 3`, and the
  first `state` event reflects a fresh pond/food layout (re-run `isWet` for the
  head cell to confirm pond flags recomputed).
- Eat: scripted `turn` sequence that steers the head into the seeded rng's first
  food → `eat` event fired exactly once with `{c,r}` === the food cell, `state`
  event fires with `score 10`, `length 4`; a second `state` event does
  **not** fire on the same tick (one per transition).
- Death (wall): `turn` into a wall → `death` event with `won false` and
  `deathCell` matching; `state` event after with `state 'dead'`, `top`/`best`
  including the submitted score (spy leaderboard records one call).
- Win: force `won` path (core exposes a way to fill the board, or the engine
  detects `snap.won`) → `death` event `{c: null, r: null, won: true}`, `state`
  event with `won true`; leaderboard still submitted.
- Mute: `mute()` ×2 → two `mute` events with `{muted:false},{muted:true}` in
  order; `sound.setMuted` called with the same booleans; `sound.play('resume')`
  suppressed while muted (spy records zero `play` calls after mute).
- Graphics: `graphics.render` called once per `update` (not per tick); mock
  size(w,h) called on construct and on an exposed `resize()` if present.
- Clock clamp: a single `update(500)` behaves as `update(100)` (R-PERF-02) —
  assert no more than one tick boundary crossed at score 0.
