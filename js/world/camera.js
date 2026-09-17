import * as THREE from 'three';
import { cellToWorld } from '../game/core.js';

// T10 (camera) — a state-driven, preallocated cinematic rig.
//   cameraPose({state,t,deathCell,tSinceDeath})  — pure (Node-testable).
//   Shake                                        — decaying multi-impulse (preallocated, max 8).
//   CameraRig                                    — thin three wrapper composing the two.
// Pure math (pose + shake) is exported for Node tests; the class only composes
// and writes into module/preallocated Vector3s (no per-frame allocation, R-PERF-04).
// Death/won framing and the pond reference come from core (R-ARCH-01).

const TAU = Math.PI * 2;
export const T_DOLLY = 1.5; // seconds of the death dolly
const DOLLY_DIST = 8;       // 3D distance from the death cell (end pose)
const DOLLY_HEIGHT = 3;     // height above the death cell (end pose)
const DOLLY_HORIZ = Math.sqrt(DOLLY_DIST * DOLLY_DIST - DOLLY_HEIGHT * DOLLY_HEIGHT);
export const SHAKE_CAP = 0.5;
export const SHAKE_MAX = 8;
const SHAKE_DECAY = 6;
const SHAKE_TTL_MS = 1200; // impulses expire after 1.2 s
const MAGIC = 2654435761;

// Pure: the "playing/paused" framing — base (0,13,17.5) + Lissajous sway.
function playingPose(t) {
  return {
    position: {
      x: 0.15 * Math.sin(0.11 * t),
      y: 13,
      z: 17.5 + 0.15 * Math.sin(0.07 * t)
    },
    target: { x: 0, y: 0, z: 0 }
  };
}

// Pure: smoothstep ease-in.
export function smoothstep(u) {
  return u * u * (3 - 2 * u);
}

// Pure: full camera pose as a function of game state (R-CINE-01).
export function cameraPose({ state, t, deathCell, tSinceDeath = 0, won }) {
  if (state === 'menu') {
    const angle = (TAU * t) / 60;
    return {
      position: { x: 20 * Math.cos(angle), y: 12, z: 20 * Math.sin(angle) },
      target: { x: 0, y: 0, z: 0 }
    };
  }
  if (state === 'playing' || state === 'paused' || state === 'won') {
    return playingPose(t);
  }
  if (state === 'dead') {
    const isWin = won === true || deathCell == null;
    if (isWin) return playingPose(t); // no dolly on a win
    const w = cellToWorld(deathCell.c, deathCell.r);
    const tDeath = t - tSinceDeath;
    const start = playingPose(tDeath);
    const end = { x: w.x, y: DOLLY_HEIGHT, z: w.z + DOLLY_HORIZ };
    const u = Math.max(0, Math.min(1, tSinceDeath / T_DOLLY));
    const s = smoothstep(u);
    return {
      position: {
        x: start.position.x + (end.x - start.position.x) * s,
        y: start.position.y + (end.y - start.position.y) * s,
        z: start.position.z + (end.z - start.position.z) * s
      },
      target: { x: w.x * s, y: 0, z: w.z * s } // lerp (0,0,0) -> (w.x,0,w.z)
    };
  }
  return playingPose(t); // unknown state -> safe framing
}

// Preallocated camera shake (max 8 simultaneous impulses). Deterministic.
export class Shake {
  constructor(nowFn) {
    this._now = nowFn || (() => Date.now());
    this._imp = new Array(SHAKE_MAX); // null slots
    for (let i = 0; i < SHAKE_MAX; i++) this._imp[i] = null;
  }

  // Store {amp, t0} in a free slot. t0 defaults to the injected now() if unset.
  push(amp, t0) {
    if (t0 === undefined) t0 = this._now();
    for (let i = 0; i < SHAKE_MAX; i++) {
      if (this._imp[i] === null) {
        this._imp[i] = { amp, t0 };
        return;
      }
    }
    this._imp[0] = { amp, t0 }; // full -> recycle the oldest slot
  }

  // World-space {x, z, y} offset at nowMs. Amplitudes decay via
  // amp*exp(-6*age); total capped at 0.5; direction is the weighted direction
  // of the per-impulse hashes h=(t0*2654435761)>>>0, angle=(h%62832)/1e4 rad.
  offset(nowMs) {
    let sum = 0;
    let vx = 0;
    let vz = 0;
    for (let i = 0; i < SHAKE_MAX; i++) {
      const im = this._imp[i];
      if (im === null) continue;
      const age = (nowMs - im.t0) / 1000;
      if (age > SHAKE_TTL_MS / 1000) {
        this._imp[i] = null;
        continue;
      }
      const a = im.amp * Math.exp(-SHAKE_DECAY * age);
      sum += a;
      const h = (im.t0 * MAGIC) >>> 0;
      const ang = (h % 62832) / 10000;
      vx += a * Math.cos(ang);
      vz += a * Math.sin(ang);
    }
    const total = Math.min(sum, SHAKE_CAP);
    const d = Math.hypot(vx, vz);
    if (d < 1e-12 || total < 1e-12) return { x: 0, z: 0, y: 0 };
    const k = total / d;
    return { x: vx * k, z: vz * k, y: total * 0.3 };
  }
}

// Thin renderer-camera wrapper used by main/engine. No per-frame allocation:
// writes into this.camera.position and this.lookTarget (both preallocated).
export class CameraRig {
  constructor(nowFn) {
    this.shake = new Shake(nowFn);
    this.lookTarget = new THREE.Vector3();
    this._pos = new THREE.Vector3();
    this.onEat = (atNowMs) => this.shake.push(0.08, atNowMs);
    this.onDeath = (atNowMs) => this.shake.push(0.45, atNowMs);
    this.events = { eat: this.onEat, death: this.onDeath };
  }

  attach(camera) {
    this.camera = camera;
    return this;
  }

  update(dtMs, stateSnapshot, tSec, tSinceDeathSec, nowMs) {
    const pose = cameraPose({
      state: stateSnapshot.state,
      t: tSec,
      deathCell: stateSnapshot.deathCell ?? null,
      tSinceDeath: tSinceDeathSec,
      won: stateSnapshot.won === true
    });
    const off = this.shake.offset(nowMs);
    this.camera.position.set(
      pose.position.x + off.x,
      pose.position.y + off.y,
      pose.position.z + off.z
    );
    this.lookTarget.set(pose.target.x, pose.target.y, pose.target.z);
    return pose;
  }
}

export function createCameraRig(nowFn) {
  return new CameraRig(nowFn);
}
