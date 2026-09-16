# Task 13: Composition root + final integration
Wave: 6
Depends on: 07, 08, 09, 10, 11, 12
Owns: `js/main.js`, `js/world/graphics.js`, `tests/integration.test.mjs`
Risk: high — final integration; all systems meet here
Requirements: R-SCOPE-01, R-SCOPE-03 (playable-first), R-PERF-02, R-PERF-03,
R-TEST-03 (browser checklist), R-TEST-04 (final gate), R-ARCH-01..04 (wiring)

## Goal
Wire the engine, world, HUD, audio, input, and quality tiers together in
`js/main.js` using real three.js graphics; verify the full headless state machine
in Node; execute and record the R-TEST-03 browser/visual checklist.

## Contract
- `js/main.js` (only file importing `js/world/*` constructors and the real
  WebAudio/HUD modules):
  1. Read `?quality=` param, `localStorage['snake_quality']` (guarded), mobile UA,
     `devicePixelRatio` → `pickQuality` / `tierConfig` (R-PERF-01).
  2. `createRealGraphics()` (in `js/world/` per R-ARCH-02 — or inline in main.js if
     simpler; prefer `js/world/graphics.js` added here as an owned file):
     build `WebGLRenderer{canvas, antialias:true, powerPreference:'high-performance'}`,
     set pixelRatio per tier, shadow map per tier, size to window; `EffectComposer`
     per R-WORLD-07 (low: no composer, render directly) with
     `SMAAPass` (standard/high) and `UnrealBloomPass` (high, threshold 0.85,
     intensity 0.4) + `OutputPass`; `handleResize()` updates renderer + composer
     sizes.
  3. Build scene per R-WORLD-07: floor, walls, water, dust, snake, food, lights,
     environment map (R-WORLD-01..08).
  4. `createEngine({ game, input, sound: createSoundBackend(), graphics, clock,
     quality })` per R-ARCH-03.
  5. Wire events (R-ARCH-04): `eat` → `shake.onEat()`, `dustBurst(atCell)`,
     `sound.play('eat')`; `death` → `shake.onDeath()`, `sound.play('death')`;
     `state` → `hud.setState(evt)`, `sound.play('resume')` on `playing` if the
     previous state was `paused`; `mute` → `hud.setMuted(evt.muted)`,
     `sound.setMuted(evt.muted)`.
  6. HUD and audio installed (R-CINE-02, R-UI-01); `visibilitychange`
     auto-pause (R-PERF-03) registered here.
  7. `requestAnimationFrame` loop (R-PERF-02): clamp dt ≤ 100 ms; `engine.update(dt)`;
     `cameraRig.update(dt, snapshot, t, tSinceDeath, performance.now())`; render
     via composer (high/standard) or `renderer.render(scene, camera)` (low).
- `js/engine/engine.js` wiring glue (if any): this file was created in task 05 as
  the real engine — do not change its public API; only the *real* graphics wiring
  lives here or in `main.js`. If engine needs small glue for composer vs. direct
  render, keep it inside the existing file's `render()` method.
- `tests/integration.test.mjs` (Node, no WebGL): headless end-to-end
  - `createGame` + `createEngine` + mock graphics/clock/sound/input (per R-ARCH-02):
    start → 5 ticks → eat (seeded rng to hit food quickly) → score 10, length 4,
    `eat` events fired with correct `{c, r}`; steer into wall → `death` event,
    `state 'dead'`, `deathCell` set; `start()` again → fresh snapshot, score 0;
    pause via `pause()` → no more tick events even after `update(10 * TICK_MS)`;
    `resume()` → ticks resume; mute toggles via `soundBackend.setMuted` called by
    the engine, `sound.play` suppressed while muted.
- R-TEST-03 browser/visual checklist: after `npm test` is green, start a static
  server on port 8000 and open `http://localhost:8000` in a browser; execute each
  checklist item in `requirements.md` and record pass/fail per item in the README
  `Execution checkpoint` section. Any item that fails → fix, re-run, re-record.
  Items that require a physical touch device are recorded as `deferred` (not
  failed) if a touch emulator is unavailable.
- Note: `js/world/graphics.js` is the `createRealGraphics` factory (R-ARCH-02)
  built here; `js/engine/engine.js` is not reworked in this task.

## Acceptance And Verification
Gate: final (wave 6).
- `npm test` — full suite green (all 12 prior tasks + this task's
  `integration.test.mjs`).
- R-TEST-03 checklist: all items executed; results (pass/fail/deferred per item)
  recorded in the README `Execution checkpoint` section; any `fail` must be
  resolved before the spec is declared `complete`.
- (Manual, not a check) `?quality=high` vs. `?quality=low` visually confirm bloom
  and dust density differences.
