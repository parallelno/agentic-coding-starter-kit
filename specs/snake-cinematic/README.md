# Snake — Cinematic Edition (spec)

Cinematic real-time 3D snake: sunlit PBR arena, living water-pond hazard,
event-driven camera shake, procedural dust, filmic post grade. No external
assets, no build step; three.js as the only dependency (ESM, no bundler).
Playable-first: the core loop works before decorative systems are judged done.

- Requirements: [requirements.md](requirements.md) (stable `R-*` IDs, coverage map)
- Manual prerequisites: [action-required.md](action-required.md)

## Cross-task invariants (authoritative source in parentheses)

- Shared snake snapshot shape + grid constants — §2 of [requirements.md](requirements.md) (R-ARCH-05)
- `isWet(c, r)` is the single wet predicate; core, food spawn, and water visuals all use it (R-WORLD-02)
- Module layering: world modules never import engine/ui/input; `main.js` is the only composition root (R-ARCH-01)
- Pure modules (`js/game/`, `js/providers/`, `input.js`, camera math) stay Node-importable with no DOM/three imports (R-TEST-01, R-ARCH-06)
- Event bus names `state|eat|death|mute` and the snapshot they carry (R-ARCH-04)
- Quality-tier values are frozen in `tierConfig`; boot-time selection only (R-PERF-01)

## Verification

- Node: Node >= 20 (dev: v24). `npm test` → `node --test "tests/*.test.mjs"` (quoted
  glob — portable on Windows). Task gate = the task's own `tests/<name>.test.mjs`;
  wave gate = `npm test` on all of the wave's tests; final gate = full suite below.
- Browser (final gate only): static server (e.g. `python -m http.server 8000`) →
  `http://localhost:8000`; execute the R-TEST-03 checklist in
  [requirements.md](requirements.md) and record it in the checkpoint. Visual/
  GPU items are manual; they are never reported as passed by Node tests or
  syntax checks.
- No lint/typecheck/build steps exist by design (R-SCOPE-02); do not invent them.

## Status

| ID | Task | Wave | Depends | Owned paths | Status |
|----|------|------|---------|-------------|--------|
| T01 | [task-01-shell](tasks/task-01-shell.md) | 1 | — | `index.html`, `js/style.css`, `tests/shell.test.mjs` | [] |
| T02 | [task-02-core](tasks/task-02-core.md) | 1 | — | `js/game/core.js`, `tests/core.test.mjs` | [] |
| T03 | [task-03-input](tasks/task-03-input.md) | 1 | — | `js/input/input.js`, `tests/input.test.mjs` | [] |
| T04 | [task-04-providers](tasks/task-04-providers.md) | 1 | — | `js/providers/{rng,leaderboard,quality}.js`, `tests/providers.test.mjs` | [] |
| T05 | [task-05-engine](tasks/task-05-engine.md) | 2 | T02, T03, T04 | `js/engine/engine.js`, `tests/engine.test.mjs` | [] |
| T06 | [task-06-environment](tasks/task-06-environment.md) | 3 | T01 | `js/world/{materials,environment,floor,walls}.js`, `tests/environment.test.mjs` | [] |
| T07 | [task-07-snake](tasks/task-07-snake.md) | 4 | T02, T06 | `js/world/snake.js`, `tests/snake.test.mjs` | [] |
| T08 | [task-08-food](tasks/task-08-food.md) | 4 | T02, T06 | `js/world/food.js`, `tests/food.test.mjs` | [] |
| T09 | [task-09-water-dust](tasks/task-09-water-dust.md) | 4 | T02, T06 | `js/world/{water,dust}.js`, `tests/effects.test.mjs` | [] |
| T10 | [task-10-camera](tasks/task-10-camera.md) | 4 | T05, T06 | `js/world/camera.js`, `tests/camera.test.mjs` | [] |
| T11 | [task-11-hud-audio](tasks/task-11-hud-audio.md) | 4 | T02, T05 | `js/ui/{hud,audio}.js`, `tests/hud.test.mjs` | [] |
| T12 | [task-12-wiring-gates](tasks/task-12-wiring-gates.md) | 5 | T01..T11 | `tests/wiring.test.mjs` | [] |
| T13 | [task-13-integration](tasks/task-13-integration.md) | 6 | T07, T08, T09, T10, T11, T12 | `js/main.js`, `js/world/graphics.js`, `tests/integration.test.mjs` | pending |

Planning-time notes: `package.json` and `tests/shell.test.mjs` were pre-created by
the planning harness (they are T01-owned; T01 treats them as existing). `npm test`
is currently green on the `package.json` block and RED on exactly one assertion:
missing `index.html` (the second test block) — expected until T01 creates it.

## Execution checkpoint

(Reserved. The executor replaces this whole section; it never accumulates.)

- Current wave: 5 COMPLETE (T12 implemented by a CODER subagent, independently
  reviewed PASS; gates coordinator-verified: wiring 5/0, wave-5 batch gate
  `npm test` 159/159). `tests/wiring.test.mjs` — 5 named tests, one per task-12
  contract assertion: (1) R-ARCH-01 layering = static import scan over the real
  on-disk `js/**` files asserting the negative invariant (world never imports
  engine/ui/providers/input; game & providers import nothing out of their own
  dir; engine never imports world/ui) with a self-check that the scanner parsed
  real imports (non-vacuous) — same-dir `./materials.js` and leaf `../game/core.js`
  are legitimate, so the scan asserts the negative up-layer bounds rather than a
  literal "only three/core.js"; (2) R-ARCH-04 event bus — state payload = live
  R-ARCH-05 core keys ∪ {length,best,top} (`deepEqual` on sorted keys), eat
  `{c,r}` = consumed food cell, death `{c,r,won}` = core deathCell/won (win →
  `{c:null,r:null,won:true}`), mute `{muted}` + `sound.setMuted` same boolean
  (stateful sound mock so payload reflects `sound.isMuted()`); (3) R-ARCH-05
  single source — last state payload minus {length,best,top} JSON-identical to
  `game.state()`; (4) R-TEST-02 deterministic replay — two same-seeded(42)
  engines + a muted third, same scripted `turn()` over 160 ms mock frames,
  identical head/score/food per step + identical final state (mute inert on
  gameplay fields); (5) R-ARCH-03 injection — storage-throwing
  `createLeaderboard` survives death submit (no throw, `state:'dead'`, score
  recorded — provider owns the try/catch; engine `_submitScore` is unguarded by
  design) + provider-less engine boots with defaults (`Math.random`/in-memory/
  `'standard'`). Prior wave-4 evidence retained below.
  T11: `js/ui/{hud,audio}.js` + `tests/hud.test.mjs` — pure `formatHud(evt)` →
  `{ score, length, best }` as prefixed `label: value` display strings (`score: 30`,
  `length: 6`, `best: 120`; missing number → `value 0`, e.g. `best: 0`) per the task-11
  pinned oracle (coordinator adjudication of a reviewer NITPICK: value-only form rejected,
  prefixed form authoritative). DOM stat bar keeps its styled `.stat-label` + value span
  with `valueOf(...)` stripping the prefix; `_deadFinal` shows the prefixed `score: N`.
  `class Hud` builds the bar + all four overlays + mute flag once; `setState`/`setMuted`
  mutate text/classes only (no new nodes); overlay toggling uses the `.visible` class per
  the CSS contract (author CSS beats the UA `[hidden]`). Pure `sfxSpec` freeze
  (eat square 660→880/80ms; death sawtooth 440→110/400ms; resume sine 520/60ms; unknown
  name → null) + `class SoundBackend`/`createSoundBackend` (lazy `AudioContext` created
  only in `unlock()`; `play` no-ops when muted/no-ctx; one osc + one gain per play;
  master gain 0.25; guarded `globalThis.AudioContext` default so Node import stays safe).
  Next task ID: T13
  `[task-13-integration](tasks/task-13-integration.md)` (wave 6, final task) → then
  the final gate (full `npm test` + independent final integration review + manual
  browser R-TEST-03 checklist).
- Reviewed & complete: T01 `index.html`, `js/style.css`, `tests/shell.test.mjs`;
  T02 `js/game/core.js`, `tests/core.test.mjs`; T03 `js/input/input.js`,
  `tests/input.test.mjs`; T04 `js/providers/{rng,leaderboard,quality}.js`,
  `tests/providers.test.mjs`; T05 `js/engine/engine.js`, `tests/engine.test.mjs`;
  T06 `js/world/{materials,environment,floor,walls}.js`,
  `tests/environment.test.mjs`; T07 `js/world/snake.js`, `tests/snake.test.mjs`;
  T08 `js/world/food.js`, `tests/food.test.mjs`; T09 `js/world/{water,dust}.js`,
  `tests/effects.test.mjs`; T10 `js/world/camera.js`, `tests/camera.test.mjs`;
  T11 `js/ui/{hud,audio}.js`, `tests/hud.test.mjs`; T12 `tests/wiring.test.mjs`.
  Evidence applies to the current working tree, uncommitted.
- Verification evidence: task gates green (shell 2, core 17, input 14, providers
  21, engine 16, environment 11, snake 12, food 9, effects 17, camera 19, hud 16,
  wiring 5); wave gates `npm test` 54 → 70 → 81 → 102 → 119 → 138 → 154 → 159 pass /
  0 fail, each re-run and confirmed by coordinator after independent review PASS for
  each wave/batch.
  Mute-payload order resolved to contract reading
  `{muted:true},{muted:false}` (post-toggle live state); one interrupted T05
  session resumed and completed (test A8 needed 1 ms `driveTicks` due to 100 ms
  frame clamp). T06: `three@^0.186.0` installed as a production dependency per
  task body (my dispatch-prompt suggestion of `-D` was superseded by the task
  body's explicit "normal dependency from task 01 onward" wording); reviewer
  noted the `assert.skip`-when-three-unimportable fallback is now unreachable
  (top-level static three imports load before any guard could fire) — accepted
  as non-blocking/dead-code given three is now a committed production dep.
- Decisions: quoted-glob test script value; pre-created `package.json` +
  `tests/shell.test.mjs` counted as T01 work; `js/world/graphics.js` assigned to
  T13; waves strictly topological: W1={T01–T04}, W2={T05}, W3={T06},
  W4={T07,T08,T09,T10,T11} (run as serialized sub-batches by owned files),
  W5={T12}, W6={T13}. T07/T08: task-08 body's "rotY≈π/2 at t=0.25" prose
  contradicts its own pinned formula (2π·0.4·0.25=0.2π≈0.628); formula treated
  as authoritative (reviewer confirmed test oracle correct). R-PERF-04 verified
  by buffer-identity/scratch reuse, not a three-namespaces proxy (task body's
  sanctioned fallback); identity assertion + no-alloc code inspection accepted.
  T03 task file wording pin
  (Space/Enter start-only, KeyP pause-only; state filtering is the consumer's
  job) confirmed legitimate boundary clarification, not spec drift. T06: three
  installed as a production (not dev) dependency, per task-06 body wording
  superseding my earlier dispatch-prompt guidance. T11: `formatHud` fixed to the
  pinned prefixed `label: value` oracles (`score: 30` / `length: 6` / `best: 120`;
  missing → `best: 0`) per the task body — reviewer NITPICK adjudicated to the
  pinned strings (value-only form rejected); `valueOf(...)` strips the prefix for
  the DOM stat spans and `_deadFinal` shows the prefixed string. T11 overlay
  toggling uses the `.visible` class (author CSS `.overlay[...]{display:none}`
  beats the UA `[hidden]` default, so `.hidden`-attribute toggling would not hide).
  T12: the task's "layering" requirement adapted to a negative-invariant
  import-structure scan (asserting what lower layers must NOT import) rather than
  a positive forward-dependency listing; non-vacuity proven via self-checks
  asserting the scanner parsed real world/engine files (world set includes both
  `three` and `../game/core.js`, engine set includes `../game/core.js`).
  T12 R-ARCH-03 injection test verifies the provider-owned try/catch in
  `createLeaderboard` swallows storage throws during `_submitScore`, not the
  engine (`_submitScore` is unguarded by design; R-ARCH-03 robustness delegated
  to the provider). Mute event payload uses a stateful mock `sound` whose
  `isMuted()` reflects the last `setMuted` call, matching the engine's
  "post-toggle live state" contract adjudicated in T11. Replay fidelity test
  uses 28 scripted frames per engine; identity-of-input is what determinism
  requires and the engine's `MAX_FRAME_MS` clamp makes 160 ms frames equivalent
  to 100 ms for gameplay purposes.
- Blockers: none
- Final gate: pending
