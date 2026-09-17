// js/world/food.js — emissive icosahedron food marker (T08, R-WORLD-05, R-PERF-04).
// A single emissive IcosahedronGeometry food marker driven by the shared snapshot's `food` field.
// Pure bob + rotate pose (no dynamic light — R-WORLD-05; emissive material only).
//
// `foodPose` is pure, Node-testable math (the test oracle). `FoodVisual` is the Three object.
// `update` performs NO per-frame allocation (R-PERF-04) — module-level scratch only.
//
// Imports: `three` and js/game/core.js only (R-ARCH-01; no engine/ui/input).
import * as THREE from 'three';
import { cellToWorld } from '../game/core.js';

// Pinned pose constants (R-CINE-03).
export const FOOD_Y_BASE = 0.45;
export const FOOD_BOB_AMP = 0.08;
export const FOOD_BOB_HZ = 2.0;
export const FOOD_SPIN_HZ = 0.4;

const TAU = Math.PI * 2;

// Module-level scratch reused by update(); no per-frame allocation (R-PERF-04).
const _pos = new THREE.Vector3();

/**
 * foodPose(tSec, c?, r?) -> { y, rotY }  (pure)
 * Deterministic bob + rotate at time tSec seconds.
 *   y    = FOOD_Y_BASE + FOOD_BOB_AMP * sin(TAU * FOOD_BOB_HZ * tSec)
 *   rotY = TAU * FOOD_SPIN_HZ * tSec
 * (c and r are accepted for interface parity; the pose is time-only.)
 */
export function foodPose(tSec, _c, _r) {
  return {
    y: FOOD_Y_BASE + FOOD_BOB_AMP * Math.sin(TAU * FOOD_BOB_HZ * tSec),
    rotY: TAU * FOOD_SPIN_HZ * tSec,
  };
}

/**
 * FoodVisual — a single emissive IcosahedronGeometry food marker (R-WORLD-05).
 * - attach(scene) -> THREE.Mesh (no light added to the scene)
 * - update(snapshot, tSec): positions the marker at the food cell with the bob pose;
 *   hides it (no throw) when snapshot.food is null.
 */
export class FoodVisual {
  constructor() {
    this.mesh = null;
  }

  /**
   * Build the Mesh(IcosahedronGeometry(0.35, 1), MeshStandardMaterial({color 0xffffff,
   * emissive 0xff9f43, emissiveIntensity 1.6, roughness 0.3, metalness 0.0, envMapIntensity 0.4})),
   * castShadow = true, add to `scene`. No light is added (R-WORLD-05). Return the mesh.
   */
  attach(scene) {
    const geo = new THREE.IcosahedronGeometry(0.35, 1);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xff9f43,
      emissiveIntensity: 1.6,
      roughness: 0.3,
      metalness: 0.0,
      envMapIntensity: 0.4,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    mesh.visible = false; // hidden until first food appears
    scene.add(mesh);
    this.mesh = mesh;
    return mesh;
  }

  /**
   * update(snapshot, tSec)
   * Positions the food marker at the food cell (cellToWorld) with the bob pose from tSec.
   * If snapshot.food is null, hides the marker (visible false) and returns without throwing.
   * No per-frame allocation (R-PERF-04).
   */
  update(snapshot, tSec) {
    const food = snapshot.food;
    if (!food) {
      this.mesh.visible = false;
      return;
    }
    const y = FOOD_Y_BASE + FOOD_BOB_AMP * Math.sin(TAU * FOOD_BOB_HZ * tSec);
    const rotY = TAU * FOOD_SPIN_HZ * tSec;
    const w = cellToWorld(food.c, food.r);
    _pos.set(w.x, y, w.z);
    this.mesh.position.copy(_pos);
    this.mesh.rotation.y = rotY;
    this.mesh.visible = true;
  }
}

export default FoodVisual;
