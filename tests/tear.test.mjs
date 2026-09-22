// Task 05 acceptance tests: tearing (pure, no three).
import test from 'node:test';
import assert from 'node:assert/strict';

import { tearPass } from '../js/interact/tear.js';
import { ClothSim } from '../js/core/cloth.js';
import { COLS, DT_SUB, PINNED_IDS, TEAR_STRAIN, WATER_TEAR_GAIN } from '../js/config.js';

function springIndex(sim, i, j) {
  const lo = Math.min(i, j);
  const hi = Math.max(i, j);
  for (let k = 0; k < sim.springCount; k++) {
    if (sim.springs.a[k] === lo && sim.springs.b[k] === hi) return k;
  }
  throw new Error(`no spring between ${lo} and ${hi}`);
}

// Sets spring k to exactly the requested strain by moving its b endpoint along the spring axis.
function setStrain(sim, k, strain) {
  const ia = sim.springs.a[k];
  const ib = sim.springs.b[k];
  const oa = ia * 3;
  const ob = ib * 3;
  const dx = sim.positions[ob] - sim.positions[oa];
  const dy = sim.positions[ob + 1] - sim.positions[oa + 1];
  const dz = sim.positions[ob + 2] - sim.positions[oa + 2];
  const len = Math.hypot(dx, dy, dz) || 1;
  const target = sim.springs.rest[k] * (1 + strain);
  const s = target / len;
  sim.positions[ob] = sim.positions[oa] + dx * s;
  sim.positions[ob + 1] = sim.positions[oa + 1] + dy * s;
  sim.positions[ob + 2] = sim.positions[oa + 2] + dz * s;
}

test('an idle cloth does not tear itself (no self-tearing at rest)', () => {
  const sim = new ClothSim();
  for (let i = 0; i < 120; i++) {
    sim.step(DT_SUB);
    tearPass(sim, null);
  }
  assert.equal(sim.tornCount, 0, 'relaxed cloth must stay intact');
  for (let i = 0; i < 480; i++) {
    sim.step(DT_SUB);
    tearPass(sim, null);
  }
  assert.equal(sim.tornCount, 0, 'settled cloth must stay intact over 5 s');
});

test('threshold is strict: 34% strain survives, 36% tears on the same call', () => {
  const sim = new ClothSim();
  const k = springIndex(sim, 12 * COLS + 12, 12 * COLS + 13);
  setStrain(sim, k, 0.34);
  assert.ok(Math.abs(sim.strain(k) - 0.34) < 1e-5, `setup strain ${sim.strain(k)}`);
  tearPass(sim, null);
  assert.equal(sim.springs.torn[k], 0, 'tearing is strictly greater than TEAR_STRAIN');

  setStrain(sim, k, 0.36);
  tearPass(sim, null);
  assert.equal(sim.springs.torn[k], 1, 'above the threshold it tears immediately');
});

test('water pressure contribution adds to strain and can tear on its own', () => {
  const sim = new ClothSim();
  const k = springIndex(sim, 10 * COLS + 10, 10 * COLS + 11);
  const ia = sim.springs.a[k];
  const ib = sim.springs.b[k];

  setStrain(sim, k, 0.3);
  const small = new Float32Array(sim.vertCount);
  small[ia] = 0.15;
  small[ib] = 0.15;
  tearPass(sim, small);
  assert.equal(sim.springs.torn[k], 0, `0.30 + ${WATER_TEAR_GAIN}*0.15 = ${0.3 + WATER_TEAR_GAIN * 0.15} stays below ${TEAR_STRAIN}`);
  assert.ok(Math.abs(0.3 + WATER_TEAR_GAIN * 0.15 - 0.3075) < 1e-9);

  const big = new Float32Array(sim.vertCount);
  big[ia] = 1.1;
  big[ib] = 1.1;
  tearPass(sim, big);
  assert.equal(sim.springs.torn[k], 1, 'a strong water impulse tears even without a pull');

  // Strictness is `s_eff > TEAR_STRAIN` (never `>=`); the 34%/36% pull case above evidences it.
  // The exact float boundary is deliberately not asserted: 0.3 + 0.05*1.0 rounds to
  // 0.35000000000000003 in IEEE754, i.e. strictly greater than TEAR_STRAIN.
  assert.equal(TEAR_STRAIN, 0.35);
});

test('a strained row severs completely and the two halves then behave independently', () => {
  const sim = new ClothSim();
  for (let i = 0; i < 120; i++) {
    sim.step(DT_SUB);
    tearPass(sim, null);
  }
  assert.equal(sim.tornCount, 0, 'settled first');

  // Strain the row 12/13 boundary directly: push the lower half 0.6 m down (the task allows
  // writing positions directly). The boundary springs stretch far past the threshold.
  const boundary = 12;
  for (let r = boundary + 1; r < sim.rows; r++) {
    for (let c = 0; c < COLS; c++) {
      sim.positions[(r * COLS + c) * 3 + 1] -= 0.6;
    }
  }
  for (let pass = 0; pass < 8; pass++) {
    sim.step(DT_SUB);
    tearPass(sim, null);
  }

  let severedBoundarySprings = 0;
  for (let c = 0; c + 1 < COLS; c++) {
    if (sim.springs.torn[springIndex(sim, boundary * COLS + c, (boundary + 1) * COLS + c)] !== 0) severedBoundarySprings++;
  }
  assert.ok(severedBoundarySprings > 25, `most of the strained row boundary must sever, got ${severedBoundarySprings}/${COLS - 1}`);

  // No healing: every spring torn before the rest phase is still torn afterwards (the set can
  // still grow while the freed half keeps moving, but nothing may be restored).
  const tornBefore = Uint8Array.from(sim.springs.torn);
  for (let i = 0; i < 240; i++) {
    sim.step(DT_SUB);
    tearPass(sim, null);
  }
  for (let k = 0; k < tornBefore.length; k++) {
    if (tornBefore[k]) assert.equal(sim.springs.torn[k], 1, `spring ${k} must stay torn`);
  }
  assert.ok(sim.tornCount >= tornBefore.reduce((sum, v) => sum + v, 0), 'torn set never shrinks');

  // Independence: the lower half now hangs free and drifts away from the upper half.
  const above = boundary * COLS + 16;
  const below = (boundary + 1) * COLS + 16;
  const gap = () =>
    Math.hypot(
      sim.positions[above * 3] - sim.positions[below * 3],
      sim.positions[above * 3 + 1] - sim.positions[below * 3 + 1],
      sim.positions[above * 3 + 2] - sim.positions[below * 3 + 2],
    );
  assert.ok(gap() > 0.1, `severed halves separated (gap ${gap().toFixed(3)} m)`);

  sim.reset();
  assert.equal(sim.tornCount, 0, 'reset restores the cloth');
  assert.equal(PINNED_IDS.length, 2);
});

test('gentle pulls never tear (10 slow pulls leave the cloth intact)', () => {
  const sim = new ClothSim();
  for (let pull = 0; pull < 10; pull++) {
    const index = (10 + pull) * COLS + 16;
    const base = [sim.positions[index * 3], sim.positions[index * 3 + 1], sim.positions[index * 3 + 2]];
    for (let step = 1; step <= 60; step++) {
      const f = step / 60;
      sim.setTempPin(index, base[0] + 0.05 * f, base[1] - 0.02 * f, base[2]);
      sim.step(DT_SUB);
      tearPass(sim, null);
    }
    sim.clearTempPin();
    for (let i = 0; i < 30; i++) {
      sim.step(DT_SUB);
      tearPass(sim, null);
    }
  }
  assert.equal(sim.tornCount, 0, `10 slow pulls must leave the cloth intact (tore ${sim.tornCount})`);
});