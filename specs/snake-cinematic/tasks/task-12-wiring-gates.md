# Task 12: Cross-module wiring, layering, and determinism gates
Wave: 5 (starts wave 5; must run only after all wave-4 tasks are green)
Depends on: 01, 02, 03, 04, 05, 06, 07, 08, 09, 10, 11
Owns: `tests/wiring.test.mjs`
Risk: high — gates the whole wave 4 surface before integration
Requirements: R-ARCH-01 (layering), R-ARCH-04 (event bus), R-ARCH-05 (snapshot
shape), R-ARCH-03 (injection points), R-TEST-02 (deterministic replay)

## Goal
Prove, in Node, that all wave-1..4 modules wire together cleanly: layering
integrity, event-bus contract, single-source snapshot, and deterministic seeded
playthrough — before task 13 touches a real WebGL context.

## Contract
- `tests/wiring.test.mjs` (Node, no WebGL, no real DOM beyond the fake objects
  this test defines):
  1. **Layering (R-ARCH-01):** for every file in `js/world/*`, read the source and
     assert it imports *only* `three`, `three/addons/*`, and `js/game/core.js`
     (wet predicate). `js/game/*` and `js/providers/*` import nothing out of
     their dir. `js/engine/engine.js` imports `js/game/*`, `js/input/*`,
     `js/providers/*`, and `three` — but not `js/world/*` or `js/ui/*`.
     (Static text scan is acceptable here; it is the cheapest correct check for
     a "no import" rule.)
  2. **Event bus (R-ARCH-04):** with mock graphics/clock/sound/input
     (per R-ARCH-02), `createEngine`, then subscribe to all four events
     (`state|eat|death|mute`); trigger `start()`, force an `eat` via seeded rng
     + ticks (reuse the T05/T13 technique), force a `death`, and assert:
     every `state` event payload contains **exactly** the R-ARCH-05 snapshot keys
     plus `length`/`best`/`top` (R-ARCH-04) and no others; `eat` carries `{c,r}`
     equal to the food cell just consumed; `death` carries `{c, r, won}` matching
     the core `deathCell`/`won` flags (win → `{c: null, r: null, won: true}`);
     `mute` carries `{muted}` and `sound.setMuted` was called with the same
     boolean.
  3. **Snapshot single source (R-ARCH-05):** take the last `state` event payload
     (T05) and remove only the engine-added keys `length|best|top`; the
     remaining object must be `JSON.stringify`-identical to `game.state()` (T02).
     The engine payload must never re-derive or rephrase a core field (e.g.
     `length` must equal `snap.snake.length`).
  4. **Deterministic replay (R-TEST-02):** two engines, same `seededRng(42)` and
     same scripted `turn()` sequence (e.g. a fixed 60-step pattern), same mock
     clock stepping 160 ms at a time → identical head positions, scores, food
     cells at every step, and identical final `state` payload. One engine that
     additionally mutes mid-game must still match on all gameplay fields
     (mute must not perturb simulation).
  5. **Injection points (R-ARCH-03):** engine constructed with a throwing mock
     leaderboard does not crash on `death` submission (engine swallows and logs
     nothing, gameplay continues to `state 'dead'`); engine constructed without
     any provider still boots (defaults to `Math.random` / in-memory leaderboard /
     `'standard'` quality).

## Acceptance And Verification
Gate: task (wave 5 — this is the wave gate for everything before T13):
- `npm test` on the full suite (T01–T11 tests + this file) green.
- Each of the five assertions above has its own named `test(...)` so a failure
  pinpoints the broken contract.
