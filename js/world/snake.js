import * as THREE from 'three';
import { COLORS } from '../config.js';
import { cellToWorld } from '../core/game.js';

/**
 * M1 placeholder visuals for the snake and one apple.
 * Segment positions are linearly interpolated between the previous and
 * current logic step (`lerp(prev, cur, alpha)`) — constant-velocity motion
 * with no per-step easing, so there is no "surge-and-settle" wobble.
 * Full visual identity (pulse, head/eyes, joints) arrives in M4.
 */
export class SnakeView {
  /** @param {THREE.Scene} scene */
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.name = 'snake';
    scene.add(this.group);

    this.headMat = new THREE.MeshLambertMaterial({ color: COLORS.SNAKE_HEAD });
    this.bodyMat = new THREE.MeshLambertMaterial({ color: COLORS.SNAKE_BODY });
    this._geo = new THREE.CapsuleGeometry(0.42, 0.4, 4, 10);

    /** @type {THREE.Mesh[]} */
    this.segs = [];
    /** @type {THREE.Vector3[]} visual positions (world) */
    this._pos = [];
    /** @type {boolean[]} whether the visual position has been initialized */
    this._init = [];
  }

  _ensureMeshes(n) {
    while (this.segs.length < n) {
      const isHead = this.segs.length === 0;
      const m = new THREE.Mesh(this._geo, isHead ? this.headMat : this.bodyMat);
      m.castShadow = true;
      m.scale.y = 0.9;
      this.group.add(m);
      this.segs.push(m);
      this._pos.push(new THREE.Vector3());
      this._init.push(false);
    }
  }

  /** Force visual positions to re-snap on next update (used on restart). */
  reset() {
    this._init = this._init.map(() => false);
  }

  /**
   * @param {number[][]} prevSnake  head-first logical cells, previous step
   * @param {number[][]} curSnake   head-first logical cells, current step
   * @param {number} alpha 0..1 fraction of the current step elapsed
   */
  update(prevSnake, curSnake, alpha) {
    this._ensureMeshes(curSnake.length);

    for (let i = 0; i < curSnake.length; i++) {
      const a = cellToWorld(prevSnake[i] ?? curSnake[i]);
      const b = cellToWorld(curSnake[i]);
      const p = this._pos[i];
      p.x = a.x + (b.x - a.x) * alpha;
      p.z = a.z + (b.z - a.z) * alpha;
      if (!this._init[i]) {
        this._init[i] = true;
      }
      p.y = 0.45;
      this.segs[i].visible = true;
      this.segs[i].position.copy(p);
    }
    // Hide surplus meshes (safety — the snake never shrinks, but keep invariant)
    for (let i = curSnake.length; i < this.segs.length; i++) {
      this.segs[i].visible = false;
    }
  }
}

export class AppleView {
  /** @param {THREE.Scene} scene */
  constructor(scene) {
    this.mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.4, 16, 12),
      new THREE.MeshLambertMaterial({ color: COLORS.APPLE, emissive: 0x551010 })
    );
    this.mesh.castShadow = true;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  /** @param {[number, number]|null} cell */
  update(cell) {
    if (!cell) { this.mesh.visible = false; return; }
    this.mesh.visible = true;
    const w = cellToWorld(cell);
    this.mesh.position.set(w.x, 0.5, w.z);
  }
}