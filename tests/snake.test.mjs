// tests/snake.test.mjs — T07 (3D snake: one InstancedMesh, head-first ordering, per-instance
// gradient color, two head eyes) Node smoke tests. No browser/DOM; pure math via three is testable.
//
// Covers:
//   - segMatrix: cellWorld position (y=0.275) + extents (0.9,0.55,0.9) at a sample cell
//   - segColor: head color (#4fd18b) / tail color (#1d5c3d) endpoints, midpoint lerp, count<=1 head
//   - SnakeVisual attach: exactly one InstancedMesh, body BoxGeometry + standard material,
//     pre-allocated MAX_INSTANCES capacity; two head-eye spheres (the only non-instanced meshes)
//     with radius ~0.09
//   - update: head-first instance order (per-instance matrix matches cellWorld), draw count,
//     eye placement opposite the heading for north (offset ~ +Z within 0.05)
//   - zero per-frame allocation (R-PERF-04): instanceMatrix / instanceColor / geometry identity
//     are stable across repeated updates (no per-frame buffer reallocation)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  SnakeVisual,
  segMatrix,
  segColor,
  SEG_W,
  SEG_H,
  SEG_Y,
  EYE_R,
} from '../js/world/snake.js';
import { cellToWorld, TILE, GRID } from '../js/game/core.js';

function approx(a, b, eps = 1e-9) {
  assert.ok(Math.abs(a - b) <= eps, `expected ${a} ≈ ${b} (±${eps})`);
}

// Independent reference srgb->linear for linear-space lerp checks.
function srgbToLinear(s) {
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

const MAX_INSTANCES = GRID * GRID; // 400

test('segMatrix: position (cellWorld at y=0.275) + extents (0.9,0.55,0.9) at a sample cell', () => {
  const m = segMatrix(10, 8, { c: 0, r: -1 }, true);
  assert.ok(m instanceof THREE.Matrix4);
  // Translation columns: cellToWorld(10,8) = (0.5, -1.5).
  const w = cellToWorld(10, 8);
  approx(m.elements[12], w.x, 1e-9);
  approx(m.elements[13], SEG_Y, 1e-9);
  approx(m.elements[14], w.z, 1e-9);
  approx(m.elements[15], 1, 1e-9);
  // Column-magnitude = per-axis extents.
  approx(Math.abs(m.elements[0]), SEG_W, 1e-9);
  approx(Math.abs(m.elements[5]), SEG_H, 1e-9);
  approx(Math.abs(m.elements[10]), SEG_W, 1e-9);
  approx(SEG_W, TILE * 0.9, 1e-9);
  approx(SEG_H, 0.55, 1e-9);
  approx(SEG_Y, 0.275, 1e-9);
});

test('segMatrix: position is cellWorld for another cell/row', () => {
  const m = segMatrix(10, 8);
  const w = cellToWorld(10, 8);
  approx(m.elements[12], w.x, 1e-9);
  approx(m.elements[14], w.z, 1e-9);
});

test('segColor: head endpoint matches #4fd18b within 2/255 per channel', () => {
  const c = segColor(0, 4).getHex();
  const r = (c >> 16) & 0xff;
  const g = (c >> 8) & 0xff;
  const b = c & 0xff;
  assert.ok(Math.abs(r - 0x4f) <= 2, `R ${r} vs 0x4f`);
  assert.ok(Math.abs(g - 0xd1) <= 2, `G ${g} vs 0xd1`);
  assert.ok(Math.abs(b - 0x8b) <= 2, `B ${b} vs 0x8b`);
});

test('segColor: tail endpoint (index = count-1) matches #1d5c3d within 2/255 per channel', () => {
  const c = segColor(3, 4).getHex();
  const r = (c >> 16) & 0xff;
  const g = (c >> 8) & 0xff;
  const b = c & 0xff;
  assert.ok(Math.abs(r - 0x1d) <= 2, `R ${r} vs 0x1d`);
  assert.ok(Math.abs(g - 0x5c) <= 2, `G ${g} vs 0x5c`);
  assert.ok(Math.abs(b - 0x3d) <= 2, `B ${b} vs 0x3d`);
});

test('segColor: midpoint (index 1 of 3) equals independent linear-space lerp reference', () => {
  const got = segColor(1, 3);
  const hr = srgbToLinear(0x4f / 255);
  const hg = srgbToLinear(0xd1 / 255);
  const hb = srgbToLinear(0x8b / 255);
  const tr = srgbToLinear(0x1d / 255);
  const tg = srgbToLinear(0x5c / 255);
  const tb = srgbToLinear(0x3d / 255);
  approx(got.r, 0.5 * (hr + tr), 0.5e-6); // 8-bit hex quantization tolerance (~half a step)
  approx(got.g, 0.5 * (hg + tg), 0.5e-6);
  approx(got.b, 0.5 * (hb + tb), 0.5e-6);
});

test('segColor: count<=1 returns the head color (t=0)', () => {
  const c = segColor(0, 1);
  approx(c.r, new THREE.Color(0x4fd18b).r, 1e-9);
  approx(c.g, new THREE.Color(0x4fd18b).g, 1e-9);
  approx(c.b, new THREE.Color(0x4fd18b).b, 1e-9);
});

function buildSnake(scene) {
  const v = new SnakeVisual();
  v.attach(scene);
  return v;
}

test('attach: exactly one InstancedMesh body; BoxGeometry (0.9,0.55,0.9); standard material; capacity', () => {
  const scene = new THREE.Scene();
  const v = buildSnake(scene);
  assert.ok(v instanceof SnakeVisual);
  assert.ok(v.root instanceof THREE.Group);
  assert.ok(scene.children.includes(v.root));

  const instanced = v.root.children.filter((c) => c instanceof THREE.InstancedMesh);
  assert.equal(instanced.length, 1, 'exactly one InstancedMesh');
  const mesh = instanced[0];
  assert.ok(mesh.geometry instanceof THREE.BoxGeometry);
  const g = mesh.geometry.parameters;
  approx(g.width, 0.9, 1e-12);
  approx(g.height, 0.55, 1e-12);
  approx(g.depth, 0.9, 1e-12);
  assert.ok(mesh.material instanceof THREE.MeshStandardMaterial);
  approx(mesh.material.roughness, 0.45, 1e-9);
  approx(mesh.material.metalness, 0.08, 1e-9);
  approx(mesh.material.envMapIntensity, 0.6, 1e-9);
  // Pre-allocated instance capacity at the max board length (never reallocated during play).
  assert.equal(mesh.instanceMatrix.count, MAX_INSTANCES);
  assert.equal(mesh.instanceColor.count, MAX_INSTANCES);
});

test('attach: exactly two head-eye spheres (radius ~0.09) as the only non-instanced meshes', () => {
  const scene = new THREE.Scene();
  const v = buildSnake(scene);
  const spheres = [];
  for (const child of v.root.children) {
    if (child instanceof THREE.Mesh) {
      // InstancedMesh is a Mesh; we only want the plain eyes.
      if (child instanceof THREE.InstancedMesh) continue;
      if (child.geometry instanceof THREE.SphereGeometry) spheres.push(child);
    }
  }
  assert.equal(spheres.length, 2, 'exactly two head-eye spheres');
  for (const eye of spheres) {
    approx(eye.geometry.parameters.radius, EYE_R, 1e-9);
    approx(eye.geometry.parameters.radius, 0.09, 1e-9);
    assert.equal(eye instanceof THREE.InstancedMesh, false);
  }
  // The only non-instanced meshes are the two eyes.
  const nonInstanced = v.root.children.filter((c) => c instanceof THREE.Mesh && !(c instanceof THREE.InstancedMesh));
  assert.equal(nonInstanced.length, 2);
});

test('update: head-first order, per-instance matrix matches cellWorld, draw count set', () => {
  const scene = new THREE.Scene();
  const v = buildSnake(scene);
  const snap = {
    state: 'playing',
    snake: [
      { c: 10, r: 8 },
      { c: 10, r: 9 },
      { c: 10, r: 10 },
      { c: 10, r: 11 },
    ],
    direction: { c: 0, r: 1 },
    food: { c: 14, r: 4 },
    score: 0,
    alive: true,
    won: false,
  };
  v.update(snap);
  const mesh = v.mesh;
  assert.equal(mesh.count, 4, 'drawn instance count = snake length');
  const mat = new THREE.Matrix4();
  for (let i = 0; i < 4; i++) {
    mesh.getMatrixAt(i, mat);
    const w = cellToWorld(snap.snake[i].c, snap.snake[i].r);
    approx(mat.elements[12], w.x, 1e-9);
    approx(mat.elements[14], w.z, 1e-9);
  }
  // Head-first: index 0 is the head cell.
  mesh.getMatrixAt(0, mat);
  const head = cellToWorld(10, 8);
  approx(mat.elements[12], head.x, 1e-9);
  approx(mat.elements[14], head.z, 1e-9);
});

test('update: count<=1 keeps a single head without divide-by-zero', () => {
  const scene = new THREE.Scene();
  const v = buildSnake(scene);
  v.update({ snake: [{ c: 0, r: 0, pond: false }], direction: { c: 0, r: -1 } });
  assert.equal(v.mesh.count, 1);
  // No throw above is the assertion.
});

test('update: two head eyes are offset opposite the heading (north -> offset toward +Z within 0.05)', () => {
  const scene = new THREE.Scene();
  const v = buildSnake(scene);
  const head = { c: 10, r: 8 };
  v.update({
    snake: [head, { c: 10, r: 9 }, { c: 10, r: 10 }],
    direction: { c: 0, r: -1 }, // north = world -Z
  });
  const w = cellToWorld(head.c, head.r);
  const eyeA = v.eyes[0].position;
  const eyeB = v.eyes[1].position;
  // For north (travel -Z), the rear offset is +Z: each eye offsets by +EYE_FX in Z.
  for (const p of [eyeA, eyeB]) {
    approx(p.y, SEG_Y, 1e-9);
    approx(p.z - w.z, 0.05, 1e-9); // rear (+Z) offset
  }
  // Eyes are laterally separated (spread) in X, one each side of the head.
  const dxa = eyeA.x - w.x;
  const dxb = eyeB.x - w.x;
  assert.ok(dxa * dxb < 0, 'eyes on opposite sides of the head');
  approx(Math.abs(dxa), 0.15, 1e-9);
  approx(Math.abs(dxb), 0.15, 1e-9);
  assert.ok(eyeA.distanceTo(eyeB) > 0.01);
});

test('zero per-frame allocation (R-PERF-04): instanceMatrix / instanceColor / geometry identity stable', () => {
  const scene = new THREE.Scene();
  const v = buildSnake(scene);
  const s = (len) => ({
    snake: Array.from({ length: len }, (_, i) => ({ c: 10, r: 8 + i, pond: false })),
    direction: { c: 0, r: 1 },
  });
  v.update(s(3));
  const mesh = v.mesh;
  const beforeInstanceMatrix = mesh.instanceMatrix;
  const beforeInstanceMatrixArray = mesh.instanceMatrix.array;
  const beforeInstanceColor = mesh.instanceColor;
  const beforeInstanceColorArray = mesh.instanceColor.array;
  const beforeGeometry = mesh.geometry;
  const beforeMaterial = mesh.material;
  for (let len = 4; len <= 12; len++) v.update(s(len));
  // Same attribute objects and backing arrays were reused (no per-frame reallocation).
  assert.equal(mesh.instanceMatrix, beforeInstanceMatrix);
  assert.equal(mesh.instanceMatrix.array, beforeInstanceMatrixArray);
  assert.equal(mesh.instanceColor, beforeInstanceColor);
  assert.equal(mesh.instanceColor.array, beforeInstanceColorArray);
  assert.equal(mesh.geometry, beforeGeometry);
  assert.equal(mesh.material, beforeMaterial);
  assert.equal(mesh.count, 12);
});
