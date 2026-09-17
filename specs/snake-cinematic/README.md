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
