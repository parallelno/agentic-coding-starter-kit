// tests/food.test.mjs — T08 (single emissive icosahedron food marker, pure bob+rotate pose,
// no dynamic light) Node smoke tests. No browser/DOM; pure math via three is testable.
//
// Covers:
//   - foodPose: t=0 (y=0.45, rotY=0); t=0.25 (~y=0.45, rotY≈π/2); t=0.125 (~y=0.53) — deterministic
//   - FoodVisual attach: single Mesh with IcosahedronGeometry(0.35, 1), emissive standard material
//     (color 0xffffff, emissive 0xff9f43, emissiveIntensity 1.6, roughness 0.3, metalness 0.0,
//     envMapIntensity 0.4), castShadow true; NO Three.Light added to the scene (R-WORLD-05)
//   - update: places the marker at the food cell (cellToWorld) with the bob pose at tSec;
//     food null hides the marker (visible false) without throwing
//   - no per-frame allocation: identical geometry / material / mesh across updates
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  FoodVisual,
  foodPose,
  FOOD_Y_BASE,
  FOOD_BOB_AMP,
  FOOD_BOB_HZ,
  FOOD_SPIN_HZ,
} from '../js/world/food.js';
import { cellToWorld } from '../js/game/core.js';

function approx(a, b, eps = 1e-4) {
  assert.ok(Math.abs(a - b) <= eps, `expected ${a} ≈ ${b} (±${eps})`);
}

test('foodPose: t=0 -> y=FOOD_Y_BASE=0.45, rotY=0 (deterministic)', () => {
  assert.equal(FOOD_Y_BASE, 0.45);
  const p = foodPose(0, 14, 4);
  assert.ok(typeof p.y === 'number' && typeof p.rotY === 'number');
  approx(p.y, 0.45, 1e-9);
  approx(p.rotY, 0, 1e-9);
  const p2 = foodPose(0, 14, 4);
  assert.equal(p.y, p2.y);
  assert.equal(p.rotY, p2.rotY);
});

test('foodPose: t=0.25 -> rotY = 2π*0.4*0.25 = 0.2π ≈ 0.6283 (formula); y ≈ base (sin(π)=0)', () => {
  // NOTE: the task body's t=0.25 line prose says "rotY ≈ π/2" but its own pinned formula
  // (rotY = 2π * 0.4 * tSec) yields 2π*0.4*0.25 = 0.2π ≈ 0.6283. The t=0.125 oracle
  // (0.314159 = 0.1π) is only consistent with the formula, so the formula is authoritative.
  const p = foodPose(0.25, 14, 4);
  approx(p.rotY, 2 * Math.PI * 0.4 * 0.25, 1e-9);
  approx(p.rotY, Math.PI * 0.2, 1e-9); // 0.2π ≈ 0.6283
  // y at t=0.25: sin(TAU*2*0.25)=sin(π)≈0 -> y ≈ base
  approx(p.y, FOOD_Y_BASE, 1e-4);
});

test('foodPose: t=0.125 -> y near base+amp = 0.53 (quarter bob cycle -> +amp) and rotY within range', () => {
  const p = foodPose(0.125, 14, 4);
  approx(p.y, 0.45 + 0.08, 0.05);
  // rotY = TAU*0.4*0.125 = TAU*0.05 = 0.1π ≈ 0.314
  approx(p.rotY, Math.PI * 0.1, 0.05);
});

test('foodPose constants and formula are pinned', () => {
  assert.equal(FOOD_BOB_AMP, 0.08);
  assert.equal(FOOD_BOB_HZ, 2.0);
  assert.equal(FOOD_SPIN_HZ, 0.4);
  // Verify the documented formula by hand.
  const t = 0.3;
  const p = foodPose(t, 14, 4);
  approx(p.y, 0.45 + 0.08 * Math.sin(2 * Math.PI * 2 * t), 1e-9);
  approx(p.rotY, 2 * Math.PI * 0.4 * t, 1e-9);
});

function sceneLightCount(scene) {
  return scene.children.filter((c) => c instanceof THREE.Light).length;
}

test('attach: single Mesh with IcosahedronGeometry(0.35,1); emissive standard material; castShadow', () => {
  const scene = new THREE.Scene();
  const v = new FoodVisual();
  v.attach(scene);
  assert.ok(v instanceof FoodVisual);

  const meshes = scene.children.filter((c) => c instanceof THREE.Mesh);
  assert.equal(meshes.length, 1, 'exactly one food mesh in the scene');
  const mesh = v.mesh;
  assert.ok(mesh.geometry instanceof THREE.IcosahedronGeometry);
  approx(mesh.geometry.parameters.radius, 0.35, 1e-12);
  assert.equal(mesh.geometry.parameters.detail, 1);

  assert.ok(mesh.material instanceof THREE.MeshStandardMaterial);
  assert.equal(mesh.material.color.getHex(), 0xffffff);
  assert.equal(mesh.material.emissive.getHex(), 0xff9f43);
  assert.ok(Math.abs(mesh.material.emissiveIntensity - 1.6) < 1e-9, 'emissiveIntensity 1.6');
  assert.ok(Math.abs(mesh.material.roughness - 0.3) < 1e-9, 'roughness 0.3');
  assert.ok(Math.abs(mesh.material.metalness - 0.0) < 1e-9, 'metalness 0.0');
  assert.ok(Math.abs(mesh.material.envMapIntensity - 0.4) < 1e-9, 'envMapIntensity 0.4');
  assert.equal(mesh.castShadow, true);
});

test('attach + update: NO dynamic light in the scene (R-WORLD-05)', () => {
  const scene = new THREE.Scene();
  const v = new FoodVisual();
  v.attach(scene);
  assert.equal(sceneLightCount(scene), 0, 'no Three.Light after attach');
  v.update({ food: { c: 14, r: 4 } }, 0.1);
  v.update({ food: { c: 14, r: 4 } }, 0.5);
  assert.equal(sceneLightCount(scene), 0, 'no Three.Light after updates');
});

test('update: places marker at the food cell (cellToWorld) with bob pose at tSec', () => {
  const scene = new THREE.Scene();
  const v = new FoodVisual();
  v.attach(scene);
  const cell = { c: 14, r: 4 };
  v.update({ food: cell }, 0.1);
  assert.equal(v.mesh.visible, true);
  const w = cellToWorld(14, 4);
  const t = 0.1;
  approx(v.mesh.position.x, w.x, 1e-9);
  approx(v.mesh.position.z, w.z, 1e-9);
  const p = foodPose(t, 14, 4);
  approx(v.mesh.position.y, p.y, 1e-9);
  approx(v.mesh.rotation.y, p.rotY, 1e-9);
});

test('update: food null hides the marker (visible false) without throwing', () => {
  const scene = new THREE.Scene();
  const v = new FoodVisual();
  v.attach(scene);
  v.update({ food: { c: 14, r: 4 } }, 0.2);
  assert.equal(v.mesh.visible, true);
  v.update({ food: null }, 0.3);
  assert.equal(v.mesh.visible, false);
  // No throw above is the assertion.
});

test('zero per-frame allocation: identical geometry / material / mesh across updates (R-PERF-04)', () => {
  const scene = new THREE.Scene();
  const v = new FoodVisual();
  v.attach(scene);
  v.update({ food: { c: 14, r: 4 } }, 0.0);
  const mesh = v.mesh;
  const beforeGeometry = mesh.geometry;
  const beforeMaterial = mesh.material;
  const beforeMesh = mesh;
  for (let i = 1; i <= 8; i++) v.update({ food: { c: 14, r: 4 }, t: i }, i * 0.1);
  assert.equal(v.mesh, beforeMesh);
  assert.equal(v.mesh.geometry, beforeGeometry);
  assert.equal(v.mesh.material, beforeMaterial);
  assert.equal(scene.children.length, 1);
});
