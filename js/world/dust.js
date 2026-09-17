import * as THREE from 'three';
import { cellToWorld } from '../game/core.js';

// T09 (dust) — two preallocated THREE.Points particle systems:
//   DustSystem  : drifting environmental dust (seeded, deterministic).
//   BurstSystem : pooled food-eat bursts.
// All integration is in place on preallocated buffers (no per-frame
// allocation, R-PERF-04). Dust counts come from the quality provider at wiring
// time (R-PERF-01); here the systems are parameterized by count. Only three
// (+addons) and core are imported (R-ARCH-01).

const TAU = Math.PI * 2;
export const DUST_BOX_X = 12;      // x, z ∈ ±12
export const DUST_Y_MIN = 0.2;
export const DUST_Y_MAX = 9;
export const BURST_LIFE = 0.6;     // seconds per burst slot
export const BURST_Y0 = 0.45;      // documented burst origin height
export const BURST_GRAVITY = 1.5;  // vy decrement per second
export const BURST_POOL = 48;

// --- tiny deterministic PRNG (mulberry32) for seeded, Node-testable streams --
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 8x8 soft-blob sprite texture. Built from a canvas in the browser; in Node a
// bare shim is wrapped so construction/inspection still works. Injectable via
// attach()/constructor to keep the math path dependency-free.
export function makeBlobSprite() {
  let src;
  if (typeof document !== 'undefined' && document.createElement) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 8;
    const ctx = cv.getContext('2d');
    const g = ctx.createRadialGradient(4, 4, 0, 4, 4, 4);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 8, 8);
    src = cv;
  } else {
    src = { width: 8, height: 8, _data: new Uint8Array(64) };
  }
  const tex = new THREE.Texture(src);
  tex.needsUpdate = true;
  return tex;
}

// --- DustSystem --------------------------------------------------------------
export class DustSystem {
  constructor() {
    this.geometry = new THREE.BufferGeometry();
    this.velocities = new Float32Array(0); // filled in attach()
    this.n = 0;
    this.points = new THREE.Points(
      this.geometry,
      new THREE.PointsMaterial({
        size: 0.14,
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        map: makeBlobSprite()
      })
    );
  }

  attach(scene, count, seed, sprite) {
    this.n = count;
    const pos = new Float32Array(count * 3);
    // Deterministic: a single mulberry32 stream drawn in a fixed order from
    // seed. Positions first (x,y,z per particle), then velocities (vx,vy,vz
    // per particle). Same count + seed -> identical initial positions.
    const rng = mulberry32(seed >>> 0);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (rng() * 2 - 1) * DUST_BOX_X;   // x ∈ ±12
      pos[i * 3 + 1] = DUST_Y_MIN + rng() * (DUST_Y_MAX - DUST_Y_MIN); // 0.2..9
      pos[i * 3 + 2] = (rng() * 2 - 1) * DUST_BOX_X; // z ∈ ±12
    }
    this.velocities = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      this.velocities[i * 3] = (rng() * 2 - 1) * 0.15;     // vx ∈ ±0.15 u/s
      this.velocities[i * 3 + 1] = -(0.05 + rng() * 0.15); // vy ∈ -0.05..-0.2
      this.velocities[i * 3 + 2] = (rng() * 2 - 1) * 0.15; // vz ∈ ±0.15 u/s
    }
    this.geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    if (sprite) this.points.material.map = sprite;
    this.points.frustumCulled = false;
    scene.add(this.points);
    return this;
  }

  updateDust(dtSec) {
    const p = this.geometry.attributes.position.array;
    const v = this.velocities;
    const n = this.n;
    for (let i = 0; i < n; i++) {
      p[i * 3] += v[i * 3] * dtSec;
      p[i * 3 + 1] += v[i * 3 + 1] * dtSec;
      p[i * 3 + 2] += v[i * 3 + 2] * dtSec;
      // Wrap (in place, no realloc).
      if (p[i * 3 + 1] < DUST_Y_MIN) p[i * 3 + 1] = DUST_Y_MAX;
      if (p[i * 3] > DUST_BOX_X) p[i * 3] = -DUST_BOX_X;
      else if (p[i * 3] < -DUST_BOX_X) p[i * 3] = DUST_BOX_X;
      if (p[i * 3 + 2] > DUST_BOX_X) p[i * 3 + 2] = -DUST_BOX_X;
      else if (p[i * 3 + 2] < -DUST_BOX_X) p[i * 3 + 2] = DUST_BOX_X;
    }
    this.geometry.attributes.position.needsUpdate = true;
  }
}

// --- BurstSystem -------------------------------------------------------------
export class BurstSystem {
  constructor(rng) {
    this.rng = rng || mulberry32(0);
    this.poolSize = BURST_POOL;
    this.life = new Float32Array(this.poolSize); // all 0 (inactive)
    this.velocities = new Float32Array(this.poolSize * 3);
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(this.poolSize * 3), 3)
    );
    this.points = new THREE.Points(
      this.geometry,
      new THREE.PointsMaterial({
        size: 0.16,
        color: 0xffd27f,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        map: makeBlobSprite()
      })
    );
    this.points.visible = false;
    this.points.frustumCulled = false;
  }

  attach(scene) {
    scene.add(this.points);
    return this;
  }

  emitBurst(c, r) {
    const w = cellToWorld(c, r);
    const p = this.geometry.attributes.position.array;
    const v = this.velocities;
    const rng = this.rng;
    for (let i = 0; i < this.poolSize; i++) {
      p[i * 3] = w.x;
      p[i * 3 + 1] = BURST_Y0;
      p[i * 3 + 2] = w.z;
      const a = rng() * TAU; // outward horizontal direction
      const sp = 0.4 + rng() * 0.8;
      v[i * 3] = Math.cos(a) * sp;
      v[i * 3 + 1] = 0.3 + rng() * 0.6; // small upward kick
      v[i * 3 + 2] = Math.sin(a) * sp;
      this.life[i] = BURST_LIFE;
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.points.visible = true;
  }

  updateBurst(dtSec) {
    const p = this.geometry.attributes.position.array;
    const v = this.velocities;
    const life = this.life;
    let any = false;
    for (let i = 0; i < this.poolSize; i++) {
      if (life[i] <= 0) continue;
      v[i * 3 + 1] -= BURST_GRAVITY * dtSec; // gravity
      p[i * 3] += v[i * 3] * dtSec;
      p[i * 3 + 1] += v[i * 3 + 1] * dtSec;
      p[i * 3 + 2] += v[i * 3 + 2] * dtSec;
      life[i] -= dtSec;
      if (life[i] <= 0) life[i] = 0;
      else any = true;
    }
    this.geometry.attributes.position.needsUpdate = true;
    if (!any) this.points.visible = false;
  }
}

export function createDustSystem() { return new DustSystem(); }
export function createBurstSystem(rng) { return new BurstSystem(rng); }
