// js/world/camera.js — state-driven cinematic camera + decaying multi-impulse
// shake (T10, R-CINE-01, R-WORLD-08, R-PERF-04).
//
// `cameraPose` and the `Shake` arithmetic are pure (no three in the math path),
// so the pose/oracle paths run in plain Node. `three` is imported at top only for
// `CameraRig`, whose `lookTarget`/position writes use THREE.Vector3 — the one
// renderer-facing class. All Vector3s are module-level singletons, created once
// and reused, so `CameraRig.update` performs NO per-frame allocation (R-PERF-04;
// verified by code review, not a runtime assertion).
//
// Imports: `three` and js/game/core.js only (R-ARCH-01; no engine/ui/input).
import * as THREE from 'three';
import { cellToWorld } from '../game/core.js';

const TAU = Math.PI * 2;

// --- Pinned constants (task-10 body / R-WORLD-08) ---------------------------
export const T_DOLLY = 1.5; // seconds: dead-not-won dolly duration
export const EAT_AMP = 0.08; // R-WORLD-08 eat shake amplitude
export const DEATH_AMP = 0.45; // R-WORLD-08 death shake amplitude
export const SHAKE_CLAMP = 0.5; // max combined shake magnitude
export const SHAKE_DECAY = 6; // exp(-SHAKE_DECAY * ageSec)
export const SHAKE_HASH = 2654435761; // per-event direction hash
export const SHAKE_ANG_MOD = 62832; // h % mod (≈ 2*pi * 10000)
export const SHAKE_ANG_DIV = 10000; // / div -> radians
export const SHAKE_EXPIRE_MS = 1200; // impulses older than this are dropped
export const SHAKE_Y_SCALE = 0.3; // vertical = total * 0.3
export const SHAKE_CAP = 8; // max simultaneous impulses

// Menu orbit convention (chosen, documented, testable): camera rides a circle of
// radius 20 in the x/z plane at y = 12, centered on the origin. Convention pins
// x on +x at t=0:  angle = TAU * t / 60; position = { 20*cos(angle), 12, 20*sin
// (angle) }; target = (0,0,0). => t=0 -> (20,12,0); t=30 (angle=pi) -> (-20,12,0).
const ORBIT_RADIUS = 20;
const ORBIT_HEIGHT = 12;
const ORBIT_PERIOD = 60; // seconds per full orbit

// playing/paused base pose + Lissajous (position-only wobble).
const PLAY_Y = 13;
const PLAY_Z = 17.5;
const LISS_AMP = 0.15;
const LISS_WX = 0.11;
const LISS_WZ = 0.07;

// Low-3/4 convention (chosen, documented, testable): the framing position sits
// HORIZONTALLY LOW_DIST ahead of the death cell along +z (away from where the
// snake played) and LOW_HEIGHT above it. Axis-aligned & deterministic so the
// T_DOLLY hold test is trivially assertable:
//   low = { x: deathW.x, y: deathW.y + 3, z: deathW.z + 8 }
// Cells lie on the ground plane (cellToWorld yields x/z at y=0), so deathW.y = 0.
// => low = { deathW.x, 3, deathW.z + 8 }; horizontal (+z) offset 8, height 3.
const LOW_DIST = 8;
const LOW_HEIGHT = 3;
const GROUND_Y = 0;

function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Per-event direction hash, radians (matches the pinned formula).
function shakeAngle(t0) {
  const h = (t0 * SHAKE_HASH) >>> 0;
  return (h % SHAKE_ANG_MOD) / SHAKE_ANG_DIV;
}

/**
 * cameraPose({ state, t, deathCell, tSinceDeath, won }) ->
 *   { position: {x,y,z}, target: {x,y,z} }      (pure, R-CINE-01)
 *
 * t is the camera-clock time in seconds.
 *  - menu:  orbit (see convention above).
 *  - playing|paused: base (0,13,17.5) + Lissajous (x=0.15 sin(0.11t),
 *    z=17.5+0.15 sin(0.07t)), target (0,0,0).
 *  - dead (won): same as the playing pose (no dolly).
 *  - dead (not won): dolly over T_DOLLY from the *current* playing pose toward
 *    the low-3/4 framing of deathCell (smoothstep ease-in s = 3u^2 - 2u^3,
 *    u = min(tSinceDeath / T_DOLLY, 1)); target is always the deathCell world
 *    position; holds the low-3/4 pose exactly once tSinceDeath >= T_DOLLY.
 */
export function cameraPose({ state, t, deathCell, tSinceDeath, won }) {
  // menu orbit
  if (state === 'menu') {
    const angle = (TAU * t) / ORBIT_PERIOD;
    return {
      position: {
        x: ORBIT_RADIUS * Math.cos(angle),
        y: ORBIT_HEIGHT,
        z: ORBIT_RADIUS * Math.sin(angle),
      },
      target: { x: 0, y: 0, z: 0 },
    };
  }

  // playing / paused base pose (Lissajous is position-only).
  const bx = LISS_AMP * Math.sin(LISS_WX * t);
  const by = PLAY_Y;
  const bz = PLAY_Z + LISS_AMP * Math.sin(LISS_WZ * t);
  const center = { x: 0, y: 0, z: 0 };

  if (state === 'dead') {
    // won death keeps the cinematic play view (no dolly).
    if (won || !deathCell) {
      return { position: { x: bx, y: by, z: bz }, target: center };
    }

    const dw = cellToWorld(deathCell.c, deathCell.r); // {x, z} at ground plane
    const low = { x: dw.x, y: GROUND_Y + LOW_HEIGHT, z: dw.z + LOW_DIST };
    const target = { x: dw.x, y: GROUND_Y, z: dw.z };

    const u = Math.min(tSinceDeath / T_DOLLY, 1);
    const s = u * u * (3 - 2 * u); // smoothstep ease-in == 3u^2 - 2u^3
    return {
      position: {
        x: lerp(bx, low.x, s),
        y: lerp(by, low.y, s),
        z: lerp(bz, low.z, s),
      },
      target,
    };
  }

  return { position: { x: bx, y: by, z: bz }, target: center };
}

/**
 * Shake — preallocated decaying multi-impulse camera shake (max 8).
 *
 * Construct with an injected now():  new Shake(() => performance.now()).
 *   push(amp)     records {amp, t0 = this._now(), seq} into a reused slot; when
 *                 full it overwrites the oldest slot (ring buffer).
 *   offset(nowMs) -> {x, z, y} world offset. For each still-active (non-expired)
 *                 impulse a = amp * exp(-6 * (nowMs - t0) / 1000); sum them;
 *                 total = min(sum, 0.5). The combined direction is taken from
 *                 the most-recently-pushed still-active impulse's per-event hash
 *                 angle (single-impulse case == its own hash, so the documented
 *                 angle is exact). offset = { total*cos, total*sin, total*0.3 };
 *                 {0,0,0} when nothing is active.
 *
 * No allocation per call: slots and the result object are preallocated/reused.
 */
export class Shake {
  constructor(now) {
    this._now = now;
    this._slots = []; // preallocated once
    for (let i = 0; i < SHAKE_CAP; i++) {
      this._slots.push({ amp: 0, t0: 0, seq: -1, present: false });
    }
    this._ptr = 0; // ring write pointer
    this._n = 0; // number stored (0..SHAKE_CAP)
    this._seq = 0; // monotonically increasing push order
    this._out = { x: 0, y: 0, z: 0 }; // reused result
  }

  push(amp) {
    const slot = this._slots[this._ptr];
    slot.amp = amp;
    slot.t0 = this._now();
    slot.seq = this._seq;
    slot.present = true;
    this._seq += 1;
    this._ptr = (this._ptr + 1) % SHAKE_CAP;
    if (this._n < SHAKE_CAP) this._n += 1;
  }

  offset(nowMs) {
    let sum = 0;
    let bestSeq = -1;
    let bestT0 = 0;
    let any = false;
    for (let i = 0; i < SHAKE_CAP; i++) {
      const slot = this._slots[i];
      if (!slot.present) continue;
      const age = nowMs - slot.t0;
      if (age > SHAKE_EXPIRE_MS || age < 0) continue; // expired / not started
      sum += slot.amp * Math.exp((-SHAKE_DECAY * age) / 1000);
      any = true;
      if (slot.seq > bestSeq) {
        bestSeq = slot.seq;
        bestT0 = slot.t0;
      }
    }
    const out = this._out;
    if (!any) {
      out.x = 0;
      out.y = 0;
      out.z = 0;
      return out;
    }
    const total = Math.min(sum, SHAKE_CLAMP);
    const angle = shakeAngle(bestT0);
    out.x = total * Math.cos(angle);
    out.z = total * Math.sin(angle);
    out.y = total * SHAKE_Y_SCALE;
    return out;
  }
}

// Module-level singleton for the camera look-target (created once, reused). This
// plus writing camera.position.in-place means CameraRig.update allocates nothing
// per frame (R-PERF-04 — code-review note, not a runtime assertion).
const LOOK_TARGET = new THREE.Vector3();

/**
 * CameraRig — renderer-camera wrapper; composes pose + shake and writes them to
 * the three scene camera. The ONLY class that touches three's Vector3.
 *
 *   new CameraRig(now)    — injected clock (constructs its internal Shake).
 *   attach(camera)        — store the three camera.
 *   onEat()               — shake.push(EAT_AMP)   (R-WORLD-08).
 *   onDeath(atNowMs)      — shake.push(DEATH_AMP) (R-WORLD-08; t0 from now()).
 *   update(dtMs, stateSnapshot, tSec, tSinceDeathSec, nowMs)
 *                        — write camera.position and this.lookTarget (a
 *                          preallocated Vector3); main loops with
 *                          camera.lookAt(rig.lookTarget).
 */
export class CameraRig {
  constructor(now) {
    this._now = now;
    this.shake = new Shake(now);
    this.camera = null;
    this.lookTarget = LOOK_TARGET; // reused singleton (never re-created)
  }

  attach(camera) {
    this.camera = camera;
    return this;
  }

  onEat() {
    this.shake.push(EAT_AMP);
  }

  onDeath(_atNowMs) {
    // t0 is taken from the injected clock inside push (R-WORLD-08 death shock).
    this.shake.push(DEATH_AMP);
  }

  update(dtMs, stateSnapshot, tSec, tSinceDeathSec, nowMs) {
    void dtMs; // signature parity; pose is a pure function of (state,t).
    const pose = cameraPose({
      state: stateSnapshot.state,
      t: tSec,
      deathCell: stateSnapshot.deathCell,
      tSinceDeath: tSinceDeathSec,
      won: stateSnapshot.won,
    });
    const o = this.shake.offset(nowMs);
    this.camera.position.set(
      pose.position.x + o.x,
      pose.position.y + o.y,
      pose.position.z + o.z
    );
    LOOK_TARGET.set(
      pose.target.x + o.x,
      pose.target.y + o.y,
      pose.target.z + o.z
    );
    this.lookTarget = LOOK_TARGET;
    return this;
  }
}

export default { cameraPose, Shake, CameraRig };
