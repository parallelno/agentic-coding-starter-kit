# Task 11: HUD and synthesized audio
Wave: 4
Depends on: 02, 05
Owns: `js/ui/hud.js`, `js/ui/audio.js`, `tests/hud.test.mjs`
Risk: normal
Requirements: R-CINE-02, R-UI-01, R-ARCH-03 (SoundBackend), R-ARCH-05

## Goal
A DOM overlay HUD driven purely by engine `state`/`mute` events (R-ARCH-04), plus
the WebAudio `SoundBackend` with fully synthesized SFX (R-UI-01). Both expose
pure logic that Node tests can exercise without a real DOM/AudioContext.

## Contract
- `js/ui/hud.js`:
  - pure `formatHud(evt)` → `{ score, length, best }` display strings (e.g.
    `score: 30`, `length: 6`, `best: 120`); `evt` is the engine `state` event
    payload (R-ARCH-04: snapshot fields + `length` + `best` + `top`). Missing
    `best`/`top` → 0 display, top-3 area empty.
  - pure `overlayFor(evt)` → `{ key, rows, cta }` with `key` in
    `menu|paused|dead|won` (`won` when `evt.won`), `rows` = `evt.top.slice(0,3)`
    mapped to `#{i+1}. {score}` labels (stable order), and `cta` text: `space to
    start` (menu), `space to resume` (paused), `space to play again` (dead/won).
  - `class Hud` (DOM): constructed with `container` element; `setState(evt)` and
    `setMuted(bool)` mutate existing nodes (created once at construction — no DOM
    creation per update); toggle `hidden` on `.overlay.menu/.paused/.dead(.won)`
    and refresh score/length/best/top text nodes. Uses only classes from
    `js/style.css` (task 01). No imports from engine/world/three.
- `js/ui/audio.js`:
  - pure `sfxSpec(name)` → `{type: 'square'|'sawtooth'|'sine', f0, f1, ms, gain}`
    freeze: `eat` → `{square, 660, 880, 80, 1}`, `death` → `{sawtooth, 440, 110,
    400, 1}`, `resume` → `{sine, 520, 520, 60, 1}` (R-UI-01).
  - `class SoundBackend implements SoundBackend { play(name), setMuted(bool),
    isMuted() }`: lazily creates `AudioContext` on first `play` after an explicit
    `unlock()` (called from main.js on first user gesture — R-UI-01). Each
    `play`: if `muted` or no ctx → no-op; else osc + gainNode, frequency ramp
    `f0→f1` over `ms`, gain 0.25 → 0 release, `osc.start/stop`. Preallocated
    where possible; ≤1 active node pair per play.
  - `export function createSoundBackend({ audioCtx } = {})` — inject a mock
    `audioCtx` (with `createOscillator/createGainNode` spies) for tests; default
    to `globalThis.AudioContext` guarded (Node import must not throw).
- No world/engine/three imports in either file (per R-ARCH-01).

## Acceptance And Verification
Gate: task (wave 4): `tests/hud.test.mjs`:
- `formatHud` on a hand-built snapshot (score 30, length 6, best 120) → exact
  strings; `best` absent → 0 display.
- `overlayFor` returns the right class key for each of `menu/paused/dead` and
  `dead+won`; dead content includes top-3 rows (feed a 5-entry leaderboard list,
  assert exactly 3) and the correct CTA text per state; paused shows the
  "resume" CTA.
- `SoundBackend` with a spy `audioCtx`: `play('eat')` while unmuted produces one
  oscillator of `type 'square'`, `frequency.setValueAtTime(660)` then
  `linearRampToValueAtTime(880, t+0.08)` (assert on the spy calls, tolerant on
  exact t); master gain node value 0.25; `setMuted(true)` → subsequent `play`
  invokes zero oscillator-creation ops; `isMuted` reflects the flag; `play`
  before `unlock()` (no ctx yet) is a no-op that does not throw.
- Import check: importing `js/ui/audio.js` under Node (no `AudioContext` global)
  does not throw (guarded default).
