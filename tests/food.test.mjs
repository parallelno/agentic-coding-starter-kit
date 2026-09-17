import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { cellToWorld } from '../js/game/core.js';
import {
  FOOD_Y_BASE, FOOD_BOB_AMP, FOOD_BOB_HZ, FOOD_SPIN_HZ, FOOD_R,
  foodPose, FoodVisual
} from '../js/world/food.js';

// T08 — food visual tests. three's CJS dual package runs under Node.

function near(a, b, eps = 1e-9) {
  return Math.abs(a - b) <= eps;
}

test('foodPose oracles pinned to the documented formula', () => {
  // Constants
  assert.equal(FOOD_Y_BASE, 0.45);
  assert.equal(FOOD_BOB_AMP, 0.08);
  assert.equal(FOOD_BOB_HZ, 2);
  assert.equal(FOOD_SPIN_HZ, 0.4);
  // t = 0 -> rest center, zero spin.
  const p0 = foodPose(0, 14, 4);
  assert.equal(p0.y, 0.45);
  assert.equal(p0.rotY, 0);
  // t = 0.25 -> y = 0.45 + 0.08*sin(2π*2*0.25) = 0.45 + 0.08*sin(π) ≈ 0.45.
  const p25 = foodPose(0.25, 14, 4);
  assert.ok(near(p25.y, 0.45, 1e-4), `y at 0.25 ≈ 0.45 (got ${p25.y})`);
  // rotY = 2π*0.4*0.25 = 0.2π. NOTE: the task doc's "≈ π/2" oracle is
  // inconsistent with its own authoritative formula roty = 2π*0.4*tSec
  // (which the t=0 and t=0.125 oracles both match); the formula wins.
  assert.ok(near(p25.rotY, 2 * Math.PI * 0.4 * 0.25, 1e-4), `rotY at 0.25 (got ${p25.rotY})`);
  // t = 0.125 -> y = 0.45 + 0.08*sin(2π*2*0.125) = 0.45 + 0.08*sin(π/2) = 0.53.
  const p125 = foodPose(0.125, 14, 4);
  assert.ok(near(p125.y, 0.53, 1e-4), `y at 0.125 ≈ 0.53 (got ${p125.y})`);
  assert.ok(near(p125.rotY, 2 * Math.PI * 0.4 * 0.125, 1e-4), `rotY ≈ 0.314159 (got ${p125.rotY})`);
});

test('update: food snapshot -> cell-center placement with pose y; food:null -> hidden, no throw', () => {
  const fv = new FoodVisual();
  const scene = new THREE.Scene();
  fv.attach(scene);
  const snap = { food: { c: 3, r: 5 }, snake: [], direction: { c: 0, r: -1 } };
  fv.update(snap, 0.125);
  const w = cellToWorld(3, 5);
  assert.ok(near(fv.mesh.position.x, w.x, 1e-6), 'x at cell center');
  assert.ok(near(fv.mesh.position.z, w.z, 1e-6), 'z at cell center');
  assert.ok(near(fv.mesh.position.y, 0.53, 1e-4), 'y from foodPose(0.125)');
  assert.ok(near(fv.mesh.rotation.y, 2 * Math.PI * 0.4 * 0.125, 1e-4), 'rotation.y from pose');
  assert.equal(fv.mesh.visible, true);
  // Null food: hidden, no throw.
  fv.update({ food: null, snake: [], direction: { c: 0, r: -1 } }, 1.0);
  assert.equal(fv.mesh.visible, false);
});

test('no dynamic light: attach adds exactly one mesh, an Icosahedron, and zero Lights', () => {
  const fv = new FoodVisual();
  const scene = new THREE.Scene();
  const before = scene.children.length;
  fv.attach(scene);
  assert.equal(scene.children.length, before + 1, 'exactly one child added');
  const child = scene.children[scene.children.length - 1];
  assert.equal(child, fv.mesh);
  assert.equal(child.geometry.type, 'IcosahedronGeometry');
  assert.equal(child.geometry.parameters.radius, FOOD_R, 'radius 0.35');
  assert.equal(child.material.emissive.getHex(), 0xff9f43, 'emissive 0xff9f43');
  assert.equal(child.material.emissiveIntensity, 1.6);
  assert.equal(child.castShadow, true);
  const lights = scene.children.filter((c) => c.isLight);
  assert.equal(lights.length, 0, 'no Light objects (R-WORLD-05)');
});

test('no per-frame allocation in update(): static guard — no THREE.* constructors in update body', () => {
  // ESM namespace bindings of `import * as THREE` are non-writable, so an
  // in-process constructor proxy is not feasible; the contract-sanctioned
  // fallback is a static guard over the only per-frame method (same rule as
  // snake: preallocated scratch/mesh only, R-PERF-04).
  const path = fileURLToPath(new URL('../js/world/food.js', import.meta.url));
  const src = readFileSync(path, 'utf8');
  const body = src.slice(src.indexOf('update(snapshot, tSec)'));
  const end = body.indexOf('}\n}\n') + 1;
  const updateBody = end > 1 ? body.slice(0, end) : body;
  assert.ok(!/new\s+THREE\./.test(updateBody), `update() must not construct THREE.* (found ${updateBody.match(/new\s+THREE\.\w+/)})`);
});
