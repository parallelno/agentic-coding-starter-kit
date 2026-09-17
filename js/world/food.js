import * as THREE from 'three';
import { cellToWorld } from '../game/core.js';

// T08 — Food visual: a single emissive icosahedron food marker with a pure
// bob+rotate pose function. No dynamic light (R-WORLD-05). Driven purely from
// the shared snapshot's `food` field (R-ARCH-05); `update()` reuses the single
// mesh and performs no per-frame allocation (R-PERF-04).

export const FOOD_Y_BASE = 0.45;   // rest center height above the floor
export const FOOD_BOB_AMP = 0.08;  // vertical bob amplitude (world units)
export const FOOD_BOB_HZ = 2;      // bob frequency
export const FOOD_SPIN_HZ = 0.4;   // spin frequency
export const FOOD_R = 0.35;        // icosahedron radius
export const FOOD_DETAIL = 1;      // icosahedron detail level

const TAU = Math.PI * 2;

// Pure, deterministic in tSec exactly. The (c, r) args are accepted for a
// stable signature (the pose is position-independent; placement is done in
// update() via cellToWorld).
//   y    = 0.45 + 0.08 * sin(2π * 2 * tSec)   (2 Hz, ±0.08, rest 0.45)
//   rotY = 2π * 0.4 * tSec                     (0.4 Hz spin)
export function foodPose(tSec, c, r) {
  const y = FOOD_Y_BASE + FOOD_BOB_AMP * Math.sin(TAU * FOOD_BOB_HZ * tSec);
  const rotY = TAU * FOOD_SPIN_HZ * tSec;
  return { y, rotY };
}

export class FoodVisual {
  constructor() {
    // Single preconstructed marker — created once, never re-created.
    this.mesh = new THREE.Mesh(
      new THREE.IcosahedronGeometry(FOOD_R, FOOD_DETAIL),
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0xff9f43,
        emissiveIntensity: 1.6,
        roughness: 0.3,
        metalness: 0.0,
        envMapIntensity: 0.4
      })
    );
    this.mesh.castShadow = true;
    this.mesh.visible = false;
  }

  attach(scene) {
    // Adds exactly one mesh — no light (R-WORLD-05).
    scene.add(this.mesh);
    return this;
  }

  // R-ARCH-05 shape: snapshot.food is null or {c, r}.
  update(snapshot, tSec) {
    const food = snapshot.food;
    if (!food) {
      this.mesh.visible = false;
      return;
    }
    const w = cellToWorld(food.c, food.r);
    const pose = foodPose(tSec, food.c, food.r);
    this.mesh.position.set(w.x, pose.y, w.z);
    this.mesh.rotation.y = pose.rotY;
    this.mesh.visible = true;
  }
}

export function createFoodVisual() {
  return new FoodVisual();
}
