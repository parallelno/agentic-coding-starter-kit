// js/world/snake.js — 3D snake: one InstancedMesh for the whole body (T07, R-CINE-02, R-WORLD-04, R-PERF-04).
// One InstancedMesh, head-first instance order, per-instance gradient color (#4fd18b head -> #1d5c3d
// tail), two head eyes — driven purely from the shared snapshot (R-ARCH-05).
//
// `segMatrix` / `segColor` are exported as pure, Node-testable math (the test oracles).
// `SnakeVisual` is the Three object graph. update() writes the instanceMatrix/instanceColor
// attributes and repositions the two head eyes; it performs NO per-frame allocation (R-PERF-04) —
// it reuses module-level scratch and writes into pre-allocated instance attribute buffers.
//
// Imports: `three` and js/game/core.js only (R-ARCH-01; no engine/ui/input).
import * as THREE from 'three';
import { cellToWorld, GRID, TILE } from '../game/core.js';

// Pinned body constants (R-CINE-02).
export const SEG_W = TILE * 0.9; // 0.9
export const SEG_H = 0.55;
export const SEG_Y = SEG_H / 2; // 0.275
export const EYE_R = 0.09;
export const EYE_FX = 0.05; // offset from head center toward the rear (opposite travel)
export const EYE_SPREAD = 0.15; // lateral separation between the two eyes
const MAX_INSTANCES = GRID * GRID; // 400, an upper bound on any snake length (20x20 board)

// Preconstructed once; the gradient lerps between these endpoint Colors.
const HEAD = new THREE.Color(0x4fd18b);
const TAIL = new THREE.Color(0x1d5c3d);

// Module-level scratch reused by update(); no per-frame allocation (R-PERF-04).
const _m4 = new THREE.Matrix4();
const _col = new THREE.Color();
const _opp = new THREE.Vector3(); // rear-facing (opposite travel) horizontal axis
const _lat = new THREE.Vector3(); // lateral (perpendicular) horizontal axis

/**
 * segMatrix(c, r, direction?, isHead?) -> THREE.Matrix4  (pure)
 * Composes an axis-aligned translation+scale instance matrix for a body segment at cell (c, r):
 *   translation = cellToWorld(c, r) at y = 0.275
 *   scale       = (TILE*0.9, 0.55, TILE*0.9)
 * (direction and isHead are accepted for interface parity; the body is uniform.)
 */
export function segMatrix(c, r, _direction, _isHead) {
  const w = cellToWorld(c, r);
  const m = new THREE.Matrix4();
  m.makeScale(SEG_W, SEG_H, SEG_W);
  m.setPosition(w.x, SEG_Y, w.z);
  return m;
}

/** In-place variant of segMatrix (writes into `out`, returns it) — used by update(). */
function segMatrixInto(c, r, out) {
  const w = cellToWorld(c, r);
  out.makeScale(SEG_W, SEG_H, SEG_W);
  out.setPosition(w.x, SEG_Y, w.z);
  return out;
}

/**
 * segColor(index, count) -> THREE.Color  (pure)
 * Per-instance gradient color for the segment at array index (0 head .. count-1 tail).
 * Documented lerp:
 *   t = count <= 1 ? 0 : index / (count - 1)
 *   color = lerp( #4fd18b at t=0 (head) -> #1d5c3d at t=1 (tail) )
 * Interpolated in the working (linear) color space via three's Color.lerp.
 */
export function segColor(index, count) {
  const t = count <= 1 ? 0 : index / (count - 1);
  const c = new THREE.Color();
  c.copy(HEAD).lerp(TAIL, t);
  return c;
}

/**
 * SnakeVisual — one InstancedMesh (body) + two head eyes (the only non-instanced snake meshes).
 * - attach(scene) -> THREE.Group  (snakeGroup)
 * - update(snapshot): writes per-instance matrices + colors (head-first), sets the draw count,
 *   flags both instance attributes dirty, and repositions the two head eyes.
 */
export class SnakeVisual {
  constructor() {
    this.root = null;
    this.mesh = null;
    this.eyes = null;
    this.count = 0;
  }

  /** Build the group, add the InstancedMesh + two eye meshes to `scene`, return the Group. */
  attach(scene) {
    const root = new THREE.Group();
    root.name = 'snakeGroup';

    const geo = new THREE.BoxGeometry(SEG_W, SEG_H, SEG_W);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.08, envMapIntensity: 0.6 });
    const mesh = new THREE.InstancedMesh(geo, mat, MAX_INSTANCES);
    // Pre-allocate the per-instance color buffer at capacity so setColorAt never reallocates.
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_INSTANCES * 3), 3);
    mesh.castShadow = true;
    mesh.receiveShadow = false;

    // Two head eyes, sharing one sphere geometry + one material.
    const eyeGeo = new THREE.SphereGeometry(EYE_R, 12, 10);
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x10231a, roughness: 0.4 });
    const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
    const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
    eyeL.castShadow = true;
    eyeR.castShadow = true;

    root.add(mesh);
    root.add(eyeL);
    root.add(eyeR);
    scene.add(root);

    this.root = root;
    this.mesh = mesh;
    this.eyes = [eyeL, eyeR];
    this.count = 0;
    return root;
  }

  /**
   * update(snapshot)
   * Drives the InstancedMesh (head-first, per-instance gradient color) and the two eyes from the
   * shared snapshot. No per-frame allocation (R-PERF-04).
   */
  update(snapshot) {
    const segs = snapshot.snake;
    const n = segs.length;
    const mesh = this.mesh;

    for (let i = 0; i < n; i++) {
      const s = segs[i];
      segMatrixInto(s.c, s.r, _m4);
      mesh.setMatrixAt(i, _m4);
      const t = n <= 1 ? 0 : i / (n - 1);
      _col.copy(HEAD).lerp(TAIL, t);
      mesh.setColorAt(i, _col);
    }
    mesh.count = n;
    this.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;

    this._placeEyes(snapshot);
  }

  /** Reposition the two eyes relative to the head center, offset opposite to the heading. */
  _placeEyes(snapshot) {
    const head = snapshot.snake[0];
    const w = cellToWorld(head.c, head.r);
    const d = snapshot.direction || { c: 0, r: -1 };
    // World direction of travel (X = c axis, Z = r axis).
    const dx = d.c;
    const dz = d.r;
    // Opposite (rear-facing) horizontal axis, plus a perpendicular lateral axis.
    _opp.set(-dx, 0, -dz);
    _opp.normalize();
    _lat.set(-_opp.z, 0, _opp.x);

    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1;
      const eye = this.eyes[i];
      eye.position.set(
        w.x + _opp.x * EYE_FX + _lat.x * side * EYE_SPREAD,
        SEG_Y,
        w.z + _opp.z * EYE_FX + _lat.z * side * EYE_SPREAD,
      );
    }
  }
}

export default SnakeVisual;
