# Task 03: Input capture and normalization (keyboard + touch)
Wave: 1
Depends on: none
Owns: `js/input/input.js`, `tests/input.test.mjs`
Risk: normal
Requirements: R-INPUT-01..03, R-ARCH-01

## Goal
A DOM-adapter-only input module that normalizes keyboard and pointer events into
`{type, dir?}` events delivered to an injected subscriber. Pure module logic (key
and swipe mapping) is unit-testable with a fake document; no engine/three imports.

## Contract
- `installInput({ emit, document })` registers `keydown` on `document` and
  `pointerdown`/`pointermove`/`pointerup` on `document`; returns `uninstallInput()`.
  `emit(evt)` is the sole output; event shapes:
  `{type:'turn', dir:{c,r}}`, `{type:'start'}`, `{type:'pause'}`, `{type:'mute'}`.
- Key mapping (per R-INPUT-01): `ArrowUp→{c:0,r:-1}`, `ArrowDown→{c:0,r:1}`,
  `ArrowLeft→{c:-1,r:0}`, `ArrowRight→{c:1,r:0}`; `KeyW/A/S/D` identical.
  `Space`/`Enter` → `start`. `KeyP` → `pause` (Space/Enter are exclusively
  start and never emit pause on the same key; one physical key-press emits at
  most one event). `KeyM` → `mute`.
- Swipe (per R-INPUT-02): track pointer start on `pointerdown`; on
  `pointerup`, compute dx/dy from CSS pixels; if `max(|dx|,|dy|) >= 24` and one
  axis dominates by 1.5x (or the other axis < 8 px), emit one `turn` for that
  axis (dominant axis sign). Otherwise no emit. Ignore pointer types other than
  touch/pen when a mouse swipe occurs (mouse clicks never turn).
- Swipe direction semantics must match key mapping (up = -r = -Z).
- No module-level state that survives `uninstallInput()`; re-install must not
  duplicate listeners.

## Acceptance And Verification
Gate: task (wave 1). `tests/input.test.mjs` uses a fake document object
(`addEventListener`/`removeEventListener` collecting handlers, dispatchable):
- Each of the 8 direction keys emits exactly one `turn` with the right `dir`.
- `Space` emits `start`; second `Space` press within the same session emits `start`
  again (state filtering is the consumer's job, not the input module's).
  `KeyP` emits `pause`; `Space` never also emits `pause`.
- `M` → `mute`.
- Synthetic pointer swipe up of 40 px → `turn {c:0,r:-1}`; 30 px diagonal (dx=30,dy=30)
  → no emit; 20 px vertical → no emit; mouse button pointer swipe → no emit.
- Uninstall removes all listeners; re-install produces single-behavior (no double
  emits for one key press).
