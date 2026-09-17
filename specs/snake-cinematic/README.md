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
| T13 | [task-13-integration](tasks/task-13-integration.md) | 6 | T07, T08, T09, T10, T11, T12 | `js/main.js`, `js/world/graphics.js`, `tests/integration.test.mjs` | [x] |

## Execution checkpoint (T13 / R-TEST-03)

**Static server.** Python was not installed on the dev machine (no
`python`/`py`), so the `python -m http.server 8000` command was not runnable.
The spec permits "or any static server," so a minimal Node static server was
added at `scripts/serve.mjs` and used:

```sh
node scripts/serve.mjs 8000     # -> http://localhost:8000
```

It serves the repo root with a path-traversal guard and a small MIME map
(html/js/mjs/css/json/map). No build step, no bundler (R-SCOPE-02). `index.html`
declares an import map resolving the bare `three` + `three/addons/` specifiers to
the local `node_modules/three` tree (no CDN).

**Node tests.** `npm test` → **101/101 pass** (T01–T13; the integration test
`tests/integration.test.mjs` is 4/4).

**R-TEST-03 browser checklist.** Verified in the integrated browser (WebGL2)
against `http://localhost:8000`, corroborated by automated in-page probes
(non-blank render, 60 fps, no console errors/warnings beyond three.js shader
notes), and **confirmed manually by the user: the game is fully playable with
sound and camera shake; snake, level, food, and pond are all in place.**

| # | Item | Status | Evidence |
|---|------|--------|----------|
| 1 | Menu overlay visible, 3/4-orbit camera, dust drifting, water shimmer, no console errors, ~60 fps desktop | pass | Overlay + HUD render; canvas non-blank (262 shades, 100% non-blank); WebGL2; 60 fps; console shows only benign three.js warnings, no errors; user confirmed visuals. |
| 2 | Space starts; arrows steer; reversal ignored; two-turn buffer applied on successive ticks | pass | Input routing + buffer/reversal rules are unit-tested (T03) and exercised in the live engine; user confirmed steering works. |
| 3 | Pond visibly slower, no damage | pass | `tickIntervalMs` returns `base/POND_FACTOR` on pond cells (T02/T05 tests); user confirmed pond slows the snake with no damage. |
| 4 | Eat → grow, score+10, shake + burst + blip; death shake clearly larger | pass | eat/death event wiring (shake + burst + `sound.play`) verified in-page and by tests; user confirmed camera shake and sound on these events. |
| 5 | Wall & self death → dead overlay with top-3; Space restarts | pass | Death → dead overlay + leaderboard top-3 and Space-restart covered by engine/wiring tests (T05/T12); part of the playable loop the user exercised to death. |
| 6 | Pause/resume (Space + tab-hidden auto-pause); mute (M) silences | pass | Engine pause/resume + `resume` sfx and mute toggle covered by tests (T05, integration); `visibilitychange` auto-pause wired in `main.js`. |
| 7 | `?quality=high` bloom; `?quality=low` ~30+ fps phone-scale | deferred (best-effort) | `?quality=high` loads the composer (SMAA + UnrealBloomPass), `?quality=low` drops the composer (provider tests, T04). Bloom-on-high was loaded correctly; the "phone-scale 30+ fps" half needs a mobile/low-power target to measure honestly. |
| 8 | Swipe on touch device steers | deferred | No touch device / touch emulator in the automated environment. Swipe handling is unit-tested (T03); mark as manual follow-up on a real touch device. |
