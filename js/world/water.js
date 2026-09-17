import * as THREE from 'three';
import { POND_CX, POND_CY, POND_R, TILE } from '../game/core.js';

// T09 (water) — a living water pond: transparent circular disc + a shimmering
// foam ring + slow radial foam animation. Pure math is exported and
// Node-testable; `update()` is allocation-free (reuses the preallocated foam
// position buffer) and performs only a few dozen ops per frame (R-PERF-04).
// The pond's wet cells come from core's POND_* constants (single source of
// truth, R-ARCH-01). No light is added.

export const FOAM_OFFSET = 0.15; // foam sits just outside the wet boundary
export const FOAM_R = POND_R * TILE + FOAM_OFFSET; // 3.15
export const FOAM_SEGMENTS = 64;
export const FOAM_Y = 0.03; // just above the water disc

const TAU = Math.PI * 2;
const CX = POND_CX - (20 / 2 - 0.5); // 4.5  (cellToWorld(14,14).x)
const CZ = POND_CY - (20 / 2 - 0.5); // 4.5  (cellToWorld(14,14).z)

// --- Pure (Node-importable) -------------------------------------------------
export function waterCenterWorld() {
  return { x: CX, z: CZ }; // (4.5, 4.5) == cellToWorld(14, 14)
}

export function waterRadiusWorld() {
  return POND_R * TILE; // 3.0
}

// Evenly spaced foam ring points at radius 3.15 around (4.5, 4.5); index 0 is
// at angle 0 (+X). Returns world {x, z} pairs.
export function foamRingSegments(count = 64) {
  const out = new Array(count);
  for (let i = 0; i < count; i++) {
    const a = (TAU * i) / count;
    out[i] = { x: CX + FOAM_R * Math.cos(a), z: CZ + FOAM_R * Math.sin(a) };
  }
  return out;
}

// Per-foam-vertex radial offset. Deterministic, per-vertex phase from index:
//   0.03 * sin(2π * 0.5 * tSec + i * 2.4)
// Oracles: shimmerOffset(0, 0, 64) = 0 ; shimmerOffset(0.5, 1, 64)
//         = 0.03 * sin(2π*0.25 + 2.4) = 0.03 * sin(π/2 + 2.4).
// (count is retained for a stable signature; the phase is index-based.)
export function shimmerOffset(tSec, i, count) {
  return 0.03 * Math.sin(TAU * 0.5 * tSec + i * 2.4);
}

export class WaterVisual {
  constructor() {
    // Transparent circular water disc.
    this.water = new THREE.Mesh(
      new THREE.CircleGeometry(waterRadiusWorld(), 48),
      new THREE.MeshStandardMaterial({
        color: 0x2e8ea8,
        transparent: true,
        opacity: 0.55,
        roughness: 0.08,
        metalness: 0.15,
        envMapIntensity: 0.8
      })
    );
    this.water.rotation.x = -Math.PI / 2; // horizontal, just above the floor
    this.water.position.set(CX, 0.02, CZ); // 0.02 to avoid z-fighting

    // Foam ring as a LineLoop; vertices are stored in LOCAL coordinates
    // centered at the pond, so `foam.position` places it and update() only
    // rewrites x/z in place (allocation-free).
    const N = FOAM_SEGMENTS;
    const arr = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const a = (TAU * i) / N;
      arr[i * 3] = FOAM_R * Math.cos(a);
      arr[i * 3 + 1] = FOAM_Y;
      arr[i * 3 + 2] = FOAM_R * Math.sin(a);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    this.foam = new THREE.LineLoop(
      geo,
      new THREE.LineBasicMaterial({
        color: 0xeaf6fb,
        transparent: true,
        opacity: 0.8
      })
    );
    this.foam.position.set(CX, 0, CZ);

    this.group = new THREE.Group();
    this.group.name = 'water';
    this.group.add(this.water, this.foam);
  }

  attach(scene) {
    scene.add(this.group);
    return this;
  }

  // Animate the foam ring: each vertex radius = FOAM_R + shimmerOffset(tSec,i).
  // Reuses the existing position buffer (no per-frame allocation).
  update(tSec) {
    const arr = this.foam.geometry.attributes.position.array;
    const N = FOAM_SEGMENTS;
    for (let i = 0; i < N; i++) {
      const a = (TAU * i) / N;
      const rad = FOAM_R + shimmerOffset(tSec, i, N);
      arr[i * 3] = rad * Math.cos(a);
      arr[i * 3 + 2] = rad * Math.sin(a); // y (arr[i*3+1]) stays at FOAM_Y
    }
    this.foam.geometry.attributes.position.needsUpdate = true;
  }
}

export function buildWater(scene) {
  return new WaterVisual().attach(scene);
}

export function updateWater(water, tSec) {
  water.update(tSec);
}
