import test from 'node:test';
import assert from 'node:assert/strict';
import { seededRng, defaultRng } from '../js/providers/rng.js';
import { createLeaderboard } from '../js/providers/leaderboard.js';
import {
  pickQuality,
  tierConfig,
  isMobileUA,
  MOBILE_RE,
} from '../js/providers/quality.js';

test('seededRng: documented oracle for seed 1 + two instances identical + [0,1)', () => {
  const a = seededRng(1);
  const first3 = [a(), a(), a()];
  // mulberry32(1) deterministic oracle (standard formula, pinned):
  assert.ok(first3.every((v) => v >= 0 && v < 1));
  assert.equal(first3[0], 0.6270739405881613);
  assert.equal(first3[1], 0.002735721180215478);
  assert.equal(first3[2], 0.5274470399599522);

  const b = seededRng(1);
  const bFirst3 = [b(), b(), b()];
  assert.deepEqual(bFirst3, first3, 'two seededRng(1) instances produce the same stream');
});

test('defaultRng returns Math.random', () => {
  assert.equal(defaultRng(), Math.random);
});

function inMemoryStorage(fault = {}) {
  let v = null;
  return {
    storage: {
      load: () => {
        if (fault.load) fault.load();
        return v;
      },
      save: (json) => {
        if (fault.save) fault.save();
        v = json;
      },
    },
  };
}

test('leaderboard: top-3 order correct after 5 mixed scores', () => {
  const { storage } = inMemoryStorage();
  const lb = createLeaderboard({ storage, now: () => 1000 });
  lb.submit(10);
  lb.submit(50);
  lb.submit(30);
  lb.submit(20);
  lb.submit(40);
  assert.deepEqual(lb.list().map((r) => r.score), [50, 40, 30, 20, 10]);
  assert.equal(lb.best(), 50);
});

test('leaderboard: 12 submits trims to 10 records', () => {
  const { storage } = inMemoryStorage();
  const lb = createLeaderboard({ storage, now: () => 0 });
  for (let i = 0; i < 12; i++) lb.submit(i * 10);
  assert.equal(lb.list().length, 10);
  // top 10 of 0..110 ascending are 110 down to 20
  assert.deepEqual(lb.list().map((r) => r.score), [110, 100, 90, 80, 70, 60, 50, 40, 30, 20]);
});

test('leaderboard: equal scores preserve insertion order', () => {
  const { storage } = inMemoryStorage();
  let t = 0;
  const lb = createLeaderboard({ storage, now: () => ++t });
  lb.submit(5); // a
  lb.submit(9);
  lb.submit(5); // b
  lb.submit(9);
  lb.submit(5); // c
  const fives = lb.list().filter((r) => r.score === 5);
  assert.deepEqual(fives.map((r) => r.at), [1, 3, 5], 'tie order = insertion order');
});

test('leaderboard: throwing injected storage falls back to memory', () => {
  const lb = createLeaderboard({
    now: () => 1,
    storage: {
      load: () => {
        throw new Error('boom load');
      },
      save: () => {
        throw new Error('boom save');
      },
    },
  });
  lb.submit(100);
  lb.submit(50);
  lb.submit(70);
  assert.deepEqual(lb.list().map((r) => r.score), [100, 70, 50]);
  assert.equal(lb.best(), 100);
});

test('leaderboard: default storage path constructs cleanly under Node', () => {
  const lb = createLeaderboard({ now: () => 42 });
  assert.doesNotThrow(() => lb.submit(15));
  assert.equal(lb.list().length, 1);
  assert.deepEqual(lb.list()[0], { score: 15, at: 42 });
  assert.equal(lb.best(), 15);
});

test('pickQuality precedence table', () => {
  assert.equal(pickQuality({ param: 'high', stored: 'low', isMobile: false }), 'high');
  assert.equal(pickQuality({ param: 'low', stored: 'high', isMobile: false }), 'low');
  assert.equal(pickQuality({ param: null, stored: 'high', isMobile: true }), 'high', 'valid stored wins over mobile');
  assert.equal(pickQuality({ param: 'nope', stored: null, isMobile: false }), 'standard', 'invalid param falls to desktop default');
  assert.equal(pickQuality({ param: 'nope', stored: 'low', isMobile: false }), 'low', 'invalid param falls to stored');
  assert.equal(pickQuality({ param: null, stored: null, isMobile: true }), 'low', 'mobile default low');
  assert.equal(pickQuality({}), 'standard', 'desktop default standard');
});

test('tierConfig deep-equals documented map for all tiers; unknown throws', () => {
  const expected = {
    low: { pixelRatio: 1, dust: 80, composer: false, shadows: 1024 },
    standard: { pixelRatio: 1.5, dust: 240, composer: 'smaa', shadows: 2048 },
    high: { pixelRatio: 2, dust: 500, composer: 'smaa+bloom', shadows: 2048 },
  };
  for (const tier of ['low', 'standard', 'high']) {
    assert.deepEqual(tierConfig(tier), expected[tier], tier);
  }
  assert.throws(() => tierConfig('ultra'), /unknown/i);
});

test('isMobileUA matches mobile UAs only', () => {
  assert.equal(MOBILE_RE.global, false, 'regex is non-global for repeatable use');
  assert.equal(isMobileUA('Mozilla iPhone'), true);
  assert.equal(isMobileUA('Mobile Safari'), true);
  assert.equal(isMobileUA('iPad'), true);
  assert.equal(isMobileUA('Android'), true);
  assert.equal(isMobileUA('Mozilla/5.0 (Windows)'), false);
  assert.equal(isMobileUA(null), false);
});
