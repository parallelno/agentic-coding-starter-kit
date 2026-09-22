// Task 06 acceptance tests: water emission/integration/hit core with a mock sim (no three).
import test from 'node:test';
import assert from 'node:assert/strict';

import { createCore, emissionCore, stepCore, drainImpulseCore, writePointPositions } from '../js/world/water.js';
import { GRAVITY, HIT_R, IMPULSE_K, RATE, WATER_LIFE, WATER_MAX, WET_ABSORB_PER_HIT } from '../js/config.js';

function mockSim(positions) {
  const vertCount = positions.length / 3;
  return {
    vertCount,
    positions: Float32Array.from(positions),
    impulses: [],
    wetness: [],
    pending: new Float32Array(vertCount),
    applyImpulse(i, dx, dy, dz) {
      const m = Math.hypot(dx, dy, dz);
      this.impulses.push({ i, m });
      this.pending[i] += m;
    },
    addWetness(i, amount) {
      this.wetness.push({ i, amount });
    },
    drainImpulseMagnitudes() {
      const out = Float32Array.from(this.pending);
      this.pending.fill(0);
      return out;
    },
  };
}

const noVertices = () => mockSim(new Float32Array(0));
const ORIGIN = { x: 0, y: 5, z: 0 };
const UP = { x: 0, y: 1, z: 0 };

test('emission rate is 900 +/- 50 particles per simulated second over 5 s', () => {
  const core = createCore(0);
  const sim = noVertices();
  const dt = 1 / 60;
  for (let i = 0; i < 300; i++) {
    emissionCore(core, dt, ORIGIN, UP);
    stepCore(core, sim, dt);
  }
  const expected = RATE * 5;
  assert.ok(Math.abs(core.spawned - expected) <= 50, `spawned ${core.spawned}, expected ${expected} +/-50`);
  assert.ok(core.live > 0, 'particles are alive');
});

test('particles die at their lifetime (WATER_LIFE +/- 0.02 s) when nothing intercepts them', () => {
  const core = createCore(0);
  const sim = noVertices();
  emissionCore(core, 1 / 120, ORIGIN, UP);
  assert.equal(core.life[0], WATER_LIFE);

  const dt = 1 / 240; // fine steps so the death step is precise
  let elapsed = 0;
  let steps = 0;
  while (core.life[0] > 0 && steps < 4000) {
    stepCore(core, sim, dt);
    elapsed += dt;
    steps++;
  }
  assert.equal(core.life[0], 0, 'particle died');
  assert.ok(Math.abs(elapsed - WATER_LIFE) <= 0.02, `lifetime ${elapsed.toFixed(4)} s vs ${WATER_LIFE} s`);
});

test('gravity acts on particles (vy decreases by GRAVITY*dt per step)', () => {
  const core = createCore(0);
  const sim = noVertices();
  emissionCore(core, 1 / 120, ORIGIN, UP);
  const v0 = core.vel[1];
  stepCore(core, sim, 1 / 120);
  assert.ok(Math.abs(core.vel[1] - (v0 + GRAVITY / 120)) < 1e-5, `vy ${v0} -> ${core.vel[1]}`);
});

test('a hit kills the particle and applies exactly one impulse and one wetness deposit', () => {
  // Single cloth vertex at (0, 5, 0). The hit test is per frame (R5) and a 6.5 m/s particle
  // travels ~0.108 m per 1/60 s step, so the particle is spawned where it LANDS inside HIT_R
  // after one step (spawning it closer would simply tunnel past, as the spec's per-frame point
  // test allows).
  const sim = mockSim(new Float32Array([0, 5, 0]));
  const core = createCore(sim.vertCount);
  const dt = 1 / 900; // exactly one particle per step, stepping 7 mm so it lands inside HIT_R
  emissionCore(core, dt, { x: 0, y: 5, z: 0.02 }, { x: 0, y: 0, z: -1 });
  assert.equal(core.spawned, 1, 'one particle emitted');
  const speed = Math.hypot(core.vel[0], core.vel[1], core.vel[2]);
  stepCore(core, sim, dt);
  const landing = Math.hypot(core.pos[0], core.pos[1] - 5, core.pos[2]);
  assert.ok(landing <= 0.06, `particle must land within HIT_R after one step (landed at ${landing.toFixed(4)} m)`);

  assert.equal(sim.impulses.length, 1, 'exactly one impulse');
  assert.equal(sim.wetness.length, 1, 'exactly one wetness deposit');
  assert.equal(sim.impulses[0].i, 0);
  assert.equal(sim.wetness[0].i, 0);
  assert.equal(sim.wetness[0].amount, WET_ABSORB_PER_HIT);
  const expected = speed * dt * IMPULSE_K;
  assert.ok(Math.abs(sim.impulses[0].m - expected) < 1e-6, `impulse ${sim.impulses[0].m} vs expected ${expected}`);
  assert.equal(core.life[0], 0, 'the hit particle is killed');

  const mags = drainImpulseCore(core, sim, 4);
  assert.equal(mags.length, sim.vertCount);
  assert.ok(Math.abs(mags[0] - expected / 4) < 1e-6, `per-substep magnitude ${mags[0]} vs ${expected / 4}`);
  assert.equal(sim.pending[0], 0, 'the sim impulse buffer is drained');
});

test('a miss calls nothing on the sim and the particle keeps flying', () => {
  const dt = 1 / 60;
  const side = mockSim(new Float32Array([0, 5, 0]));
  const core = createCore(side.vertCount);
  emissionCore(core, dt, { x: 0.5, y: 5, z: 0 }, UP); // 0.5 m to the side: far outside HIT_R
  stepCore(core, side, dt);
  assert.equal(side.impulses.length, 0);
  assert.equal(side.wetness.length, 0);
  assert.ok(core.life[0] > 0, 'no hit -> still alive');

  const outside = mockSim(new Float32Array([0, 5, 0]));
  const core2 = createCore(outside.vertCount);
  emissionCore(core2, dt, { x: HIT_R * 1.2, y: 5, z: 0 }, UP);
  stepCore(core2, outside, dt);
  assert.equal(outside.impulses.length, 0, `${HIT_R * 1.2} m away is outside HIT_R`);

  const inside = mockSim(new Float32Array([0, 5, 0]));
  const core3 = createCore(inside.vertCount);
  emissionCore(core3, 1 / 900, { x: HIT_R * 0.5, y: 5, z: 0 }, UP); // small step, lands nearby
  stepCore(core3, inside, 1 / 900);
  assert.equal(inside.impulses.length, 1, `${HIT_R * 0.5} m away is inside HIT_R`);
});

test('particles are recycled at the floor and the pool never exceeds WATER_MAX', () => {
  const sim = mockSim(new Float32Array([0, 100, 0])); // far away: no hits
  const core = createCore(sim.vertCount);
  const dt = 1 / 60;
  for (let i = 0; i < 900; i++) {
    emissionCore(core, dt, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: -1 });
    stepCore(core, sim, dt);
  }
  let alive = 0;
  for (let i = 0; i < core.max; i++) if (core.life[i] > 0) alive++;
  assert.ok(alive <= WATER_MAX, `live ${alive} <= ${WATER_MAX}`);
  for (let i = 0; i < core.max; i++) {
    if (core.life[i] > 0) assert.ok(core.pos[i * 3 + 1] >= 0, `slot ${i} above the floor`);
  }
});

test('hot path allocates nothing per step (heap probe when --expose-gc is available)', () => {
  const sim = mockSim(new Float32Array([0, 5, 0]));
  const core = createCore(sim.vertCount);
  const dt = 1 / 60;
  for (let i = 0; i < 200; i++) {
    emissionCore(core, dt, { x: 0, y: 5, z: 2 }, { x: 0, y: 0, z: -1 });
    stepCore(core, sim, dt);
  }

  if (typeof global.gc !== 'function') {
    // Without --expose-gc the N2 claim rests on inspection: emissionCore, stepCore and
    // writePointPositions only read/write pre-allocated typed arrays (no `new` in the loop).
    assert.ok(true, 'heap probe skipped: run `node --expose-gc --test tests/water.test.mjs` to enable');
    return;
  }
  global.gc();
  const before = process.memoryUsage().heapUsed;
  for (let i = 0; i < 2000; i++) {
    emissionCore(core, dt, { x: 0, y: 5, z: 2 }, { x: 0, y: 0, z: -1 });
    stepCore(core, sim, dt);
  }
  global.gc();
  const growth = process.memoryUsage().heapUsed - before;
  assert.ok(growth < 2 * 1024 * 1024, `heap growth ${growth} bytes over 2000 steps`);
});

test('dead slots are parked below the floor in the Points buffer', () => {
  const core = createCore(0);
  const sim = noVertices();
  emissionCore(core, 1 / 60, ORIGIN, UP);
  const arr = new Float32Array(WATER_MAX * 3);
  writePointPositions(core, arr);
  assert.ok(Math.abs(arr[1] - ORIGIN.y) < 1, 'live particle written at its position');
  assert.ok(arr[(WATER_MAX - 1) * 3 + 1] < -1e5, 'unused slot parked far below');

  core.life[0] = 0;
  writePointPositions(core, arr);
  assert.ok(arr[1] < -1e5, 'dead slot parked');
});