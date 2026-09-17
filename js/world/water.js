// js/world/water.js — pond water surface + foam ring (T09, R-WORLD-02,
// R-PERF-04). Pure placement/shimmer math (Node-testable) + the Three
// construction/update part. No per-vertex allocation in updateWater
// (R-PERF-04): only a handful of in-place, allocation-free scalars.
import * as THREE from 'three';
import { cellToWorld, POND_R, TILE, POND_CX, POND_CY } from '../game/core.js';

// Pond center/radius derive from the single R-WORLD-02 source:
// cell (14,14), radius 3.0 cells -> world (4.5, 4.5), radius 3.0 world
// (GRID 20, TILE 1.0).
export const WATER_COLOR = 0x2e8ea8; // pinned (task-09 body)
export const WATER_EMISSIVE = 0x14475f;
export const WATER_OPACITY = 0.55;
export const FOAM_COLOR = 0xeaf6fb; // pale, reads as foam (not pure white)
export const FOAM_OPACITY = 0.8; // pinned (task-09 body)
export const WATER_Y = 0.02; // just above the floor
export const FOAM_Y = 0.03; // just above the water
const TAU = Math.PI * 2;
export const WATER_SEGMENTS = 48;
// Pinned pure-math ring radius (task-09 acceptance): 3.0 + 0.15 = 3.15,
// so foamRingSegments sits just outside the wet boundary.
export const FOAM_RING_OFFSET = 0.15;
// Visual foam mesh outer radius (task-09 body RingGeometry(3.0, 3.3, 48)).
export const FOAM_THICKNESS = 0.3;

/**
 * waterCenterWorld() -> {x, z}
 * Pinned cell (14,14) through the shared core cellToWorld.
 * Oracle: {x: 4.5, z: 4.5} (100% coverage).
 */
export function waterCenterWorld() {
  return cellToWorld(POND_CX, POND_CY);
}

/**
 * waterRadiusWorld() -> number (world units)
 * POND_R cells * TILE. Oracle: 3.0.
 */
export function waterRadiusWorld() {
  return POND_R * TILE;
}

/**
 * foamRingSegments(count = 64) -> Array<{x, z}>
 * Evenly spaced points on the foam ring, index 0 at world angle 0 (+x axis),
 * going counter-clockwise. Pinned radius = waterRadiusWorld() +
 * FOAM_RING_OFFSET = 3.0 + 0.15 = 3.15 (just outside the wet boundary).
 * Exact formula (oracles recompute independently):
 *   step = TAU / count
 *   p[i] = { x: cx + R*cos(step*i), z: cz + R*sin(step*i) }
 */
export function foamRingSegments(count = 64) {
  const { x: cx, z: cz } = waterCenterWorld();
  const R = waterRadiusWorld() + FOAM_RING_OFFSET;
  const step = (Math.PI * 2) / count;
  const pts = new Array(count);
  for (let i = 0; i < count; i++) {
    const a = step * i;
    pts[i] = { x: cx + R * Math.cos(a), z: cz + R * Math.sin(a) };
  }
  return pts;
}

/**
 * shimmerOffset(tSec, i, count) -> number in [-0.03, 0.03]
 * A per-vertex shimmer phase: deterministic in (t, i), zero-alloc.
 * Exact formula (documented oracle — tests recompute it independently):
 *   0.03 * sin(TAU * tSec + i * 2.4)   where TAU = 2*pi
 * Oracles: (t=0, i=0) -> 0; (t=0.5, i=1) -> 0.03*sin(pi + 2.4).
 * The i * 2.4 term is an irrational-ish phase spread so no two
 * vertices shimmer in lockstep.
 */
export function shimmerOffset(tSec, i, count) {
  void count; // kept in the signature for a stable, per-vertex API
  return 0.03 * Math.sin(TAU * tSec + i * 2.4);
}

class Water {
  constructor() {
    this.water = null;
    this.foam = null;
  }

  /**
   * build(scene) -> this
   * Adds the water disk (CircleGeometry(POND_R*TILE, 48), opaque-ish
   * standard material) and the foam ring (RingGeometry(inner=R, outer=R+0.3))
   * at their pinned positions. No light is added here.
   */
  build(scene) {
    const { x, z } = waterCenterWorld();
    const R = waterRadiusWorld();

    const waterMat = new THREE.MeshStandardMaterial({
      color: WATER_COLOR,
      emissive: WATER_EMISSIVE,
      emissiveIntensity: 0.06,
      roughness: 0.08,
      metalness: 0.15,
      transparent: true,
      opacity: WATER_OPACITY,
      envMapIntensity: 0.8, // pinned (task-09 body)
    });
    this.water = new THREE.Mesh(
      new THREE.CircleGeometry(R, WATER_SEGMENTS),
      waterMat
    );
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.set(x, WATER_Y, z);
    scene.add(this.water);

    const foamMat = new THREE.MeshStandardMaterial({
      color: FOAM_COLOR,
      roughness: 0.6,
      metalness: 0.0,
      transparent: true,
      opacity: FOAM_OPACITY,
      side: THREE.DoubleSide,
    });
    this.foam = new THREE.Mesh(
      new THREE.RingGeometry(R, R + FOAM_THICKNESS, WATER_SEGMENTS),
      foamMat
    );
    this.foam.rotation.x = -Math.PI / 2;
    this.foam.position.set(x, FOAM_Y, z);
    scene.add(this.foam);

    return this;
  }

  /**
   * updateWater(tSec)
   * Re-shimmer the pond with a few dozen allocation-free ops: pulse the
   * water emissive and foam opacity via the exported shimmerOffset, and
   * rotate the foam ring slowly. No per-vertex writes, no allocation.
   */
  updateWater(tSec) {
    const s0 = shimmerOffset(tSec, 0, 1);
    const s1 = shimmerOffset(tSec, 1, 1);
    const wm = this.water.material;
    wm.emissiveIntensity = 0.06 + s0 * 1.5; // s0 in [-0.03,0.03]
    // clamp foam opacity to [0,1]
    const fo = this.foam.material;
    fo.opacity = clamp(FOAM_OPACITY + s1 * 1.5, 0.2, 1);
    // slow deterministic ripple spin (1 op)
    this.foam.rotation.z = tSec * 0.25;
  }
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export default Water;
