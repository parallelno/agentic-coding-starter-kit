import * as THREE from 'three';
import { EVT } from '../core/events.js';

/**
 * Damped impulse camera shake.
 * Each event pushes energy in; position jitter = direction * energy * sin(freq*t),
 * energy decays exponentially. Disabled via setting (M8 wires it).
 */
export class Shake {
  /** @param {import('three').Camera} cam @param {import('../core/events.js').Events} events */
  constructor(cam, events) {
    this.cam = cam;
    this.events = events;
    /** world-space offsets added to the camera each frame @type {THREE.Vector3} */
    this.offset = new THREE.Vector3();
    this.energy = 0;
    this._t = 0;
    this.enabled = true;
    this._baseOffset = new THREE.Vector3(); // follow-cam target offset (set by follow.js via addBase)
    this._unsubs = [];
    if (events) {
      const amp = { [EVT.COLLECT]: 0.05, [EVT.DIE]: 0.35 };
      for (const name of Object.keys(amp)) {
        this._unsubs.push(events.on(name, () => this.kick(amp[name])));
      }
    }
  }

  /** @param {THREE.Vector3} v offset produced by the follow camera this frame */
  addBase(v) { this._baseOffset.copy(v); }

  /** @param {number} e impulse energy */
  kick(e) {
    if (!this.enabled) return;
    this.energy = Math.min(1.5, this.energy + e);
  }

  /**
   * @param {number} dt
   * @returns {THREE.Vector3} total offset to add to the follow-cam position
   */
  update(dt) {
    if (!this.enabled) { this.offset.set(0, 0, 0); return this.offset; }
    this._t += dt;
    const f = 2 * Math.PI * 9; // 9 Hz jiggle
    const s = this.energy * Math.sin(f * this._t) * 0.6;
    this.offset.set(
      this._baseOffset.x + s * 0.8,
      this._baseOffset.y + s * 0.5,
      this._baseOffset.z + s
    );
    this.energy *= Math.exp(-3.2 * dt);
    return this.offset;
  }
}