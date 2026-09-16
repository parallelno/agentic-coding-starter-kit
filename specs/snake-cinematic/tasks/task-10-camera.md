# Task 10: Camera language + shake system
Wave: 4
Depends on: 05, 06
Owns: `js/world/camera.js`, `tests/camera.test.mjs`
Risk: normal
Requirements: R-CINE-01, R-WORLD-08, R-PERF-04

## Goal
A state-driven camera rig: pose as a pure function of (state, t, deathCell, tDeath)
plus a decaying multi-impulse shake, all preallocated.

## Contract
- `cameraPose({ state, t, deathCell, tSinceDeath })` — pure, returns
  `{ position: {x,y,z}, target: {x,y,z} }` (R-CINE-01):
  - `menu`: orbit radius 20, height 12, angle = 2π * t / 60 around center, target (0,0,0).
  - `playing|paused`: base (0, 13, 17.5) + Lissajous (x = 0.15 sin(0.11t),
    z = 0.15 sin(0.07t)), target (0, 0, 0).
  - `dead` (not won): dolly over `T_DOLLY = 1.5` s from the playing pose toward
    low-3/4 (distance 8 from deathCell, height 3 above it), smoothstep ease-in,
    target the deathCell world position; after T_DOLLY the pose holds.
  - `dead` (`won`): same as playing pose (no dolly).
- `class Shake` (preallocated, max 8 simultaneous impulses):
  - `push(amp)` stores {amp, t0} (t via an injected `now()` for tests);
  - `offset(nowMs)` → {x, z, y} world offset: for each active impulse
    a = amp * exp(-6 * (nowMs - t0)/1000); sum; direction from a fixed per-event
    hash `h = (t0 * 2654435761) >>> 0`, `angle = (h % 62832) / 10000` radians;
    total = min(sum, 0.5); offset = {x: total*cos, z: total*sin, y: total*0.3};
  - expired impulses (t > 1.2 s) dropped.
- `class CameraRig` (renderer-camera wrapper, used by main/engine):
  - `attach(camera)`, `events = { eat, death }` or just
    `onEat() / onDeath(atNowMs)` calling `Shake.push(0.08) / push(0.45)`.
  - `update(dtMs, stateSnapshot, tSec, tSinceDeathSec, nowMs)` — writes
    `camera.position` and a `cameraRig.lookTarget` Vector3 (main loops with a
    scratch matrix via `camera.lookAt(target)`). Pure math path (pose + shake +
    lissajous) is exported separately for Node tests; the class only composes.
- No allocation per update (preallocated Vector3s).

## Acceptance And Verification
Gate: task (wave 4): `tests/camera.test.mjs`:
- `menu` pose at t=0 and t=30 → orbit positions are correct (radius 20, height 12,
  angle 0 and π).
- `playing` pose at t=0 → (0, 13, 17.5); at t=10 → Lissajous offsets ≈ 0.15 sin(1.1),
  0.15 sin(0.7) on x/z respectively (within 1e-4).
- `dead` at tSinceDeath = 0 → playing pose; at T_DOLLY/2 → smoothstep ≈ 0.5 midway
  (distance between endpoints × 0.5 within 1e-3); at T_DOLLY+5 → exact low-3/4 pose.
- `dead` with `won` → playing pose.
- Shake: single push 0.45 → offset at t0 = 0.45 * min-scale; at +100 ms ≈ 0.45 *
  exp(-0.6) within 1e-3; multiple overlapping impulses sum and clamp at 0.5;
  determinism: same now sequence → identical offsets.
- No allocation: (smoke) 1000 updates with the same scratch vectors do not grow a
  WeakSet of allocations (or simply: all Vector3s are module-level scratch, assert
  the class exposes no new-object methods — keep this as a code-review note, not a
  runtime assertion).
