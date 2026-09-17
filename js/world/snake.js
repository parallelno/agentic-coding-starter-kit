import * as THREE from 'three';
import { cellToWorld, GRID, TILE } from '../game/core.js';

// T07 — Snake visual system.
// One InstancedMesh for the whole snake (head-first instance order, per-instance
// gradient color) plus two head-eye spheres — the only non-instanced snake
// meshes. Driven purely from the shared snapshot (R-ARCH-05 shape); all scratch
// state is preallocated so `update()` performs zero per-frame allocations
// (R-PERF-04, R-ARCH-05).

export const SEG_W = TILE * 0.9;
export const SEG_H = 0.55;
export const SEG_Y = SEG_H / 2; // rests on the floor (floor top at y=0)
export const EYE_R = 0.09;
export const MAX_LEN = GRID * GRID;

// The gradient pair is preconstructed with raw sRGB [0,1] channel values
// (three-arg constructor performs no working-space conversion), so
// Color.lerp is a linear interpolation in sRGB, per the task contract:
// t = count <= 1 ? 0 : index / (count - 1), head index 0 -> bright.
const HEAD = new THREE.Color(0x4f / 255, 0xd1 / 255, 0x8b / 255);
const TAIL = new THREE.Color(0x1d / 255, 0x5c / 255, 0x3d / 255);

// Fixed module-level scratch set — the ONLY matrices/colors vectors a frame
// ever touches. Tests import MAX_LEN / the scratch to verify no re-creation.
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3(SEG_W, SEG_H, SEG_W);
const _c = new THREE.Color();

const EYE_SPREAD = 0.18; // lateral separation of the two eyes
const EYE_FWD = 0.12; // offset of the eye row from the head center

// --- Pure (Node-importable) -------------------------------------------------
// Matrix composing a SEG_W x SEG_H x SEG_W box centered at cellToWorld(c, r)
// with y = SEG_Y (0.275). Axis-aligned; no per-segment rotation (the head's
// eyes convey direction). The per-instance matrix carries the scale, so box
// extents are extractable from its column magnitudes (task contract).
export function segMatrix(c, r, direction, isHead) {
  const w = cellToWorld(c, r);
  _v.set(w.x, SEG_Y, w.z);
  _q.identity();
  return new THREE.Matrix4().compose(_v, _q, _s);
}

// Linear head->tail gradient in sRGB via three's Color.lerp, normalized to
// [0,1]. Documented formula: t = count <= 1 ? 0 : index / (count - 1)
// (head index 0 -> bright #4fd18b, tail -> #1d5c3d).
export function segColor(index, count) {
  const t = count <= 1 ? 0 : index / (count - 1);
  _c.copy(HEAD).lerp(TAIL, t);
  return { r: _c.r, g: _c.g, b: _c.b };
}

// --- Visual ------------------------------------------------------------------
export class SnakeVisual {
  constructor() {
    // Unit box; the final per-segment size comes from segMatrix's scale columns.
    this.mesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({
        roughness: 0.45,
        metalness: 0.08,
        envMapIntensity: 0.6,
        vertexColors: false,
      }),
      MAX_LEN
    );
    this.mesh.castShadow = true;
    // Preallocated per-instance buffer sized to max length (400). Reallocation
    // is never needed (count is only ever set down to the live length).
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(MAX_LEN * 3), 3
    );
    this.mesh.count = 0;
    // Two small head-eye spheres (the only non-instanced snake meshes).
    const eyeGeo = new THREE.SphereGeometry(EYE_R, 10, 8);
    const eyeMat = new THREE.MeshStandardMaterial({
      color: 0x0a1414, roughness: 0.2, metalness: 0
    });
    this.eyes = [
      new THREE.Mesh(eyeGeo, eyeMat),
      new THREE.Mesh(eyeGeo, eyeMat),
    ];
    this.eyes.forEach((e) => { e.castShadow = false; e.visible = false; });
  }

  attach(scene, renderer) {
    scene.add(this.mesh);
    scene.add(this.eyes[0]);
    scene.add(this.eyes[1]);
    return this;
  }

  // R-ARCH-05 shape: snapshot.snake[] is head-first, each {c,r,pond}.
  update(snapshot) {
    const n = snapshot.snake.length;
    for (let i = 0; i < n; i++) {
      const seg = snapshot.snake[i];
      const w = cellToWorld(seg.c, seg.r);
      _m.compose(_v.set(w.x, SEG_Y, w.z), _q, _s);
      this.mesh.setMatrixAt(i, _m);
      const col = segColor(i, n);
      this.mesh.setColorAt(i, _c.setRGB(col.r, col.g, col.b));
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
    // Head eyes sit on the side OPPOSITE the heading: heading north (r - 1)
    // puts the eye row at +Z of the head center (toward the player).
    const head = snapshot.snake[0];
    const hw = cellToWorld(head.c, head.r);
    const d = snapshot.direction;
    const cx = hw.x - d.c * EYE_FWD; // row offset opposite the heading
    const cz = hw.z - d.r * EYE_FWD;
    const px = -d.r * EYE_SPREAD; // perpendicular spread of the two eyes
    const pz = d.c * EYE_SPREAD;
    this.eyes[0].position.set(cx + px, SEG_Y + EYE_R, cz + pz);
    this.eyes[1].position.set(cx - px, SEG_Y + EYE_R, cz - pz);
    this.eyes.forEach((e) => { e.visible = true; });
  }
}

export function createSnakeVisual() {
  return new SnakeVisual();
}
