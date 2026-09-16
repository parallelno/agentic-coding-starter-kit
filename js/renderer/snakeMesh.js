import * as THREE from 'three';
import { toWorld } from '../game/grid.js';
import { WATER_WOBBLE } from '../config/constants.js';

const BODY_RADIUS = 0.30;
const HEAD_RADIUS = 0.4;
const SPHERE_SEGMENTS = 8;

// Preallocate temporaries so update() never allocates per frame.
const _up = new THREE.Vector3(0, 1, 0);
const _lookTarget = new THREE.Vector3();

/**
 * Renders the snake as a chain of low-poly spheres (one per body cell) that
 * lerp smoothly between grid steps. The head is visually distinct (larger
 * sphere, brighter material) and a subtle water-sway wobble is applied when
 * the head is over water. All geometry/material is shared and reused; only the
 * fixed-size mesh pool grows/shrinks to track body length (no per-frame
 * allocation).
 */
export class SnakeMesh {
  /**
   * @param {import('./renderer.js').Renderer} renderer
   */
  constructor(renderer) {
    this.renderer = renderer;

    // Shared geometry — reused across all segments.
    this.geo = new THREE.SphereGeometry(BODY_RADIUS, SPHERE_SEGMENTS, SPHERE_SEGMENTS);
    this.headGeo = new THREE.SphereGeometry(HEAD_RADIUS, SPHERE_SEGMENTS, SPHERE_SEGMENTS);

    // Shared materials — one body material, one distinct head material.
    this.mat = new THREE.MeshStandardMaterial({
      color: 0x44dd60,
      roughness: 0.4,
      metalness: 0.0,
    });
    this.headMat = new THREE.MeshStandardMaterial({
      color: 0x66ff80,
      emissive: 0x22aa44,
      emissiveIntensity: 0.35,
      roughness: 0.3,
      metalness: 0.0,
    });

    this.segments = [];   // array of THREE.Mesh (head at index 0)
    this._targetPos = []; // array of THREE.Vector3 (target, head first)
    this._curPos = [];    // array of THREE.Vector3 (current, head first)

    this.inWater = false;
    this.rippleTime = 0;  // last moment wobble was (re)activated, drives a gentle ramp-in

    this.group = new THREE.Group();
    renderer.add(this.group);
  }

  /**
   * Set the target grid cells.
   * @param {Array<{col:number, row:number}>} body body cells, head first.
   */
  setBody(body) {
    const n = body.length;

    // Grow the pool from the tail until it matches body.length.
    while (this.segments.length < n) {
      const idx = this.segments.length;
      const isHead = idx === 0;
      const mesh = new THREE.Mesh(isHead ? this.headGeo : this.geo, isHead ? this.headMat : this.mat);
      mesh.castShadow = this._shadowsEnabled();
      // Seed with the group origin so the first frame doesn't fly in from space.
      const at = toWorld(body[0].col, body[0].row);
      const v = new THREE.Vector3(at.x, 0, at.z);
      this._targetPos.push(v.clone());
      this._curPos.push(v);
      this.segments.push(mesh);
      this.group.add(mesh);
    }

    // Shrink from the tail (dispose nothing — geometry/material are shared & reused).
    while (this.segments.length > n) {
      const idx = this.segments.length - 1;
      this.group.remove(this.segments[idx]);
      this.segments.pop();
      this._targetPos.pop();
      this._curPos.pop();
    }

    // Update each segment's target world position (lerping happens in update()).
    for (let i = 0; i < n; i++) {
      const cell = body[i];
      const at = toWorld(cell.col, cell.row);
      this._targetPos[i].set(at.x, 0, at.z);
    }
  }

  /** Whether the active quality tier renders shadows. */
  _shadowsEnabled() {
    const q = this.renderer.quality;
    return !!(q && q.shadows && q.shadows.enabled);
  }

  /**
   * Advance every segment toward its target and apply the water wobble.
   * @param {number} dt seconds since the last frame.
   * @param {number} t  seconds of total elapsed time (drives the sinusoid).
   */
  update(dt, t) {
    const f = dt > 0 ? (1 - Math.pow(0.0001, dt)) : 1;
    const n = this.segments.length;
    const shadows = this._shadowsEnabled();

    // Water sway: a single subtle vertical bob driven by an elapsed-time
    // sinusoid. It is strongest at the head and tapers toward the tail, so the
    // body reads as a gentle ripple rather than a cartoonish bounce. Zero
    // when the head is out of the water.
    const sway = this.inWater
      ? Math.sin(t * 10) * WATER_WOBBLE * 0.05
      : 0;

    for (let i = 0; i < n; i++) {
      const cur = this._curPos[i];
      const target = this._targetPos[i];
      // Smooth, frame-rate-independent follow.
      cur.x += (target.x - cur.x) * f;
      cur.z += (target.z - cur.z) * f;

      const seg = this.segments[i];
      seg.castShadow = shadows;

      // More sway at the head (i=0), tapering to zero at the tail.
      const weight = n > 1 ? (n - i) / n : 1;
      const y = sway * weight;
      seg.position.set(cur.x, y, cur.z);

      // Orient each sphere toward the next segment (head faces the first body
      // cell; the tail keeps its last heading). A symmetric sphere is visually
      // unaffected, but this keeps orientation meaningful if the head gains
      // asymmetric detail. Reuse shared temporaries — no allocation.
      const next = i + 1 < n ? this._curPos[i + 1] : this._curPos[i - 1] || cur;
      _lookTarget.set(next.x - seg.position.x, 0, next.z - seg.position.z);
      if (_lookTarget.lengthSq() > 1e-6) {
        seg.quaternion.setFromUnitVectors(_up, _lookTarget.normalize());
      }
    }
  }

  /**
   * Toggle water wobble.
   * @param {boolean} active true while the head is over water.
   */
  setWaterWobble(active) {
    this.inWater = !!active;
  }

  /** Remove all segments from the scene and free shared GPU resources. */
  dispose() {
    for (const seg of this.segments) {
      this.group.remove(seg);
    }
    this.segments.length = 0;
    this._targetPos.length = 0;
    this._curPos.length = 0;

    this.renderer.remove(this.group);

    this.geo.dispose();
    this.headGeo.dispose();
    this.mat.dispose();
    this.headMat.dispose();
  }
}
