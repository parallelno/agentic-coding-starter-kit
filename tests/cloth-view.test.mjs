// Task 03 acceptance tests: pure index patcher + quad table (no three.js rendering / no DOM).
import test from 'node:test';
import assert from 'node:assert/strict';

import { ClothSim } from '../js/core/cloth.js';
import { buildQuadTable, patchTornIndices } from '../js/world/cloth.js';
import { COLS, ROWS } from '../js/config.js';

function springIndex(sim, i, j) {
  const lo = Math.min(i, j);
  const hi = Math.max(i, j);
  for (let k = 0; k < sim.springCount; k++) {
    if (sim.springs.a[k] === lo && sim.springs.b[k] === hi) return k;
  }
  throw new Error(`no spring between ${lo} and ${hi}`);
}

function indecesForQuad(indexArray, q) {
  return Array.from(indexArray.subarray(q * 6, q * 6 + 6));
}

test('quad table covers every quad with 4 structural boundary springs', () => {
  const sim = new ClothSim();
  const table = buildQuadTable(sim);
  assert.equal(table.quadCount, (COLS - 1) * (ROWS - 1));
  assert.equal(table.baseIndices.length, table.quadCount * 6);
  for (let q = 0; q < table.quadCount; q++) {
    for (let e = 0; e < 4; e++) {
      const k = table.edges[q * 4 + e];
      assert.ok(k >= 0 && k < sim.springCount, `quad ${q} edge ${e} maps to a real spring`);
      assert.ok(k < sim.structuralCount, `quad ${q} edge ${e} must be a structural spring`);
    }
    const corners = Array.from(table.corners.subarray(q * 4, q * 4 + 4));
    for (const corner of indecesForQuad(table.baseIndices, q)) {
      assert.ok(corners.includes(corner), 'base triangles reference only their own quad corners');
    }
  }
});

test('patchTornIndices leaves an untouched cloth identical and hides exactly one torn quad', () => {
  const sim = new ClothSim();
  const table = buildQuadTable(sim);
  const original = Uint16Array.from(table.baseIndices);
  const indexArray = Uint16Array.from(table.baseIndices);
  const hidden = sim.vertCount;

  const hiddenNone = patchTornIndices(indexArray, table, new Set(), hidden);
  assert.equal(hiddenNone, 0);
  assert.deepEqual(Array.from(indexArray), Array.from(original), 'untouched cloth keeps the original index pattern');

  // Tear the top edge of quad 5 only.
  const q = 5;
  const torn = new Set([table.edges[q * 4]]);
  const hiddenOne = patchTornIndices(indexArray, table, torn, hidden);
  assert.equal(hiddenOne, 1);
  assert.deepEqual(indecesForQuad(indexArray, q), [hidden, hidden, hidden, hidden, hidden, hidden], 'torn quad points at HIDDEN');

  let touched = 0;
  for (let other = 0; other < table.quadCount; other++) {
    if (other === q) continue;
    const now = indecesForQuad(indexArray, other);
    const before = indecesForQuad(original, other);
    if (now.join(',') !== before.join(',')) touched++;
  }
  assert.equal(touched, 0, 'no other quad is modified');

  const hiddenAgain = patchTornIndices(indexArray, table, new Set(), hidden);
  assert.equal(hiddenAgain, 0);
  assert.deepEqual(Array.from(indexArray), Array.from(original), 'restoring the sim restores the indices');
  assert.ok(!Array.from(indexArray).includes(hidden), 'no HIDDEN references remain');
});

test('spring-index form of the torn lookup (Uint8Array from the sim) behaves identically', () => {
  const sim = new ClothSim();
  const table = buildQuadTable(sim);
  const indexArray = Uint16Array.from(table.baseIndices);
  const hidden = sim.vertCount;
  // Quad 3 is (row 0, col 3); its left edge is shared with quad 2, so tearing that one spring
  // hides both adjacent quads.
  const k = springIndex(sim, table.corners[3 * 4 + 0], table.corners[3 * 4 + 2]);
  sim.markTorn(k);
  const hiddenQuads = patchTornIndices(indexArray, table, sim.springs.torn, hidden);
  assert.equal(hiddenQuads, 2, 'a shared torn edge hides both quads that touch it');
  for (const q of [2, 3]) {
    assert.deepEqual(indecesForQuad(indexArray, q), [hidden, hidden, hidden, hidden, hidden, hidden], `quad ${q} hidden`);
  }
  const stillVisible = [0, 1, 4, 5, table.quadCount - 1].map((q) => indecesForQuad(indexArray, q).join(','));
  assert.ok(!stillVisible.join('|').includes(String(hidden)), 'unaffected quads keep real vertices');
});
