import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SEG_W, SEG_H, SEG_Y, EYE_R, MAX_LEN, segMatrix, segColor, SnakeVisual } from '../js/world/snake.js';
import { cellToWorld, TILE } from '../js/game/core.js';

// T07 — snake visual system tests.
// snake.js imports three (CJS dual package) so these run under Node.

const EPS = 2 / 255;

function near(a, b, eps = 1e-9) {
  return Math.abs(a - b) <= eps;
}

test('segMatrix(10, 8, dir, true): translation = (0.5, 0.275, -1.5); box extents = TILE*0.9', () => {
  const m = segMatrix(10, 8, { c: 0, r: -1 }, true);
  // Translation lives in the last column.
  assert.equal(m.elements[12], 0.5, 'x');
  assert.equal(m.elements[13], SEG_Y, 'y = 0.275');
  assert.equal(m.elements[14], -1.5, 'z');
  // Column magnitudes give the box extents (per-instance scale in the matrix).
  const colX = Math.hypot(m.elements[0], m.elements[4], m.elements[8]);
  const colY = Math.hypot(m.elements[1], m.elements[5], m.elements[9]);
  const colZ = Math.hypot(m.elements[2], m.elements[6], m.elements[10]);
  assert.equal(colX, SEG_W, 'X extent = TILE*0.9');
  assert.equal(colY, SEG_H, 'Y extent = 0.55');
  assert.equal(colZ, SEG_W, 'Z extent = TILE*0.9');
  assert.equal(SEG_W, TILE * 0.9);
});

test('segColor: head/tail endpoints within 2/255; midpoint is the documented lerp', () => {
  const head = [0x4f / 255, 0xd1 / 255, 0x8b / 255];
  const tail = [0x1d / 255, 0x5c / 255, 0x3d / 255];
  const c0 = segColor(0, 3);
  assert.ok(near(c0.r, head[0], EPS), 'head r within 2/255');
  assert.ok(near(c0.g, head[1], EPS), 'head g within 2/255');
  assert.ok(near(c0.b, head[2], EPS), 'head b within 2/255');
  const c2 = segColor(2, 3);
  assert.ok(near(c2.r, tail[0], EPS), 'tail r within 2/255');
  assert.ok(near(c2.g, tail[1], EPS), 'tail g within 2/255');
  assert.ok(near(c2.b, tail[2], EPS), 'tail b within 2/255');
  // Documented lerp: t = index / (count - 1) = 0.5 -> per-channel midpoint.
  const mid = segColor(1, 3);
  for (let i = 0; i < 3; i++) {
    const expected = (head[i] + tail[i]) / 2;
    const got = [mid.r, mid.g, mid.b][i];
    assert.ok(Math.abs(got - expected) <= EPS, `mid channel ${i}: ${got} vs ${expected}`);
  }
  // Documented edge: count <= 1 -> t = 0 (bright head).
  const one = segColor(0, 1);
  assert.ok(near(one.r, head[0], EPS));
  assert.ok(near(one.g, head[1], EPS));
  assert.ok(near(one.b, head[2], EPS));
});

test('update: head-first instance order with correct world translations; length 5 causes no reallocation', () => {
  const sv = new SnakeVisual();
  const geoBefore = sv.mesh.geometry;
  const matrixBufBefore = sv.mesh.instanceMatrix.array;
  const colorBufBefore = sv.mesh.instanceColor.array;

  const snap4 = {
    direction: { c: 0, r: -1 },
    snake: [
      { c: 10, r: 8 }, { c: 10, r: 9 }, { c: 10, r: 10 }, { c: 10, r: 11 }
    ].map((s) => ({ ...s, pond: false }))
  };
  sv.update(snap4);
  assert.equal(sv.mesh.count, 4);

  // Head-first order: instance i carries snake[i]'s cell translation.
  // (instanceMatrix is a Float32Array: compare with 1e-6 tolerance)
  for (let i = 0; i < 4; i++) {
    const arr = sv.mesh.instanceMatrix.array;
    const w = cellToWorld(snap4.snake[i].c, snap4.snake[i].r);
    assert.ok(near(arr[i * 16 + 12], w.x, 1e-6), `instance ${i} x`);
    assert.ok(near(arr[i * 16 + 14], w.z, 1e-6), `instance ${i} z`);
    assert.ok(near(arr[i * 16 + 13], SEG_Y, 1e-6), `instance ${i} y`);
  }

  const snap5 = {
    direction: snap4.direction,
    snake: [...snap4.snake, { c: 10, r: 12, pond: false }]
  };
  sv.update(snap5);
  assert.equal(sv.mesh.count, 5);
  // No reallocation: geometry and instance buffers are the SAME objects.
  assert.equal(sv.mesh.geometry, geoBefore, 'geometry unchanged');
  assert.equal(sv.mesh.instanceMatrix.array, matrixBufBefore, 'instanceMatrix buffer unchanged');
  assert.equal(sv.mesh.instanceColor.array, colorBufBefore, 'instanceColor buffer unchanged');
  // Capacity documented at construction: >= 5 (really GRID*GRID = 400).
  assert.ok(MAX_LEN >= 5 && MAX_LEN === 400, 'instance capacity = GRID*GRID');
});

test('eyes: exactly 2 spheres, positioned on the side opposite heading (north -> +Z)', () => {
  const sv = new SnakeVisual();
  assert.equal(sv.eyes.length, 2);
  sv.eyes.forEach((e) => assert.equal(e.geometry.type, 'SphereGeometry'));
  const snap = {
    direction: { c: 0, r: -1 }, // heading north (toward row 0)
    snake: [{ c: 10, r: 8, pond: false }]
  };
  sv.update(snap);
  const w = cellToWorld(10, 8); // (0.5, -1.5)
  sv.eyes.forEach((e, i) => {
    // Opposite heading => eyes at +Z of head center (z > -1.5), within ±0.05.
    assert.ok(e.position.z > w.z, `eye ${i} on +Z side`);
    assert.ok(Math.abs(e.position.z - (w.z + 0.12)) <= 0.05, `eye ${i} z at +0.12 (±0.05) got ${e.position.z}`);
    assert.ok(Math.abs(e.position.x - w.x) <= 0.19, `eye ${i} x near head x`);
    assert.ok(Math.abs(e.position.y - (SEG_Y + EYE_R)) <= 1e-6, `eye ${i} y seats on head top`);
  });
});

test('no per-frame allocation in update(): no THREE.* constructors in the update body (static guard)', () => {
  // Snake.js consumes three through an ESM namespace import whose bindings are
  // non-writable, so an in-process constructor proxy is not feasible. Fallback
  // per the task contract: a static guard that the `update` method body (the
  // only per-frame code) contains no `new THREE.*` constructors — all scratch
  // is the fixed module-level set. This is the executable check of
  // R-PERF-04's "preallocated scratch only" rule for snake.js.
  const path = fileURLToPath(new URL('../js/world/snake.js', import.meta.url));
  const src = readFileSync(path, 'utf8');
  const updateBody = src.slice(src.indexOf('update(snapshot)'));
  const nextMethod = updateBody.indexOf('}', updateBody.indexOf('eyes.forEach'));
  const body = updateBody.slice(0, nextMethod);
  // No constructor calls anywhere in the method.
  assert.ok(!/new\s+THREE\./.test(body), `update() must not construct THREE.* (found: "${body.match(/new\s+THREE\.\w+/)}")`);
  // needsUpdate flags are raised each frame (buffer reuse, not realloc).
  assert.ok(/instanceMatrix\.needsUpdate\s*=\s*true/.test(body));
  assert.ok(/instanceColor\.needsUpdate\s*=\s*true/.test(body));
});
