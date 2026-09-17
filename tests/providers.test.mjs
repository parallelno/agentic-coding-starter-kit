// tests/providers.test.mjs — T04 task gate: rng, leaderboard, quality.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seededRng, defaultRng } from '../js/providers/rng.js';
import { createLeaderboard } from '../js/providers/leaderboard.js';
import {
  MOBILE_RE,
  isMobileUA,
  pickQuality,
  tierConfig,
} from '../js/providers/quality.js';

// --- rng --------------------------------------------------------------------

// Documented mulberry32 oracle for seed 1 (captured in Node at full precision).
const ORACLE_SEED1 = [0.62707394058816135, 0.0027357211802154779, 0.52744703995995224];

test('seededRng(1) first 3 outputs equal the documented oracle', () => {
  const f = seededRng(1);
  const out = [f(), f(), f()];
  assert.equal(out[0], ORACLE_SEED1[0]);
  assert.equal(out[1], ORACLE_SEED1[1]);
  assert.equal(out[2], ORACLE_SEED1[2]);
});

test('two seededRng(1) instances produce identical streams', () => {
  const a = seededRng(1);
  const b = seededRng(1);
  for (let i = 0; i < 50; i++) {
    assert.equal(a(), b());
  }
});

test('seededRng outputs are always in [0,1)', () => {
  const f = seededRng(42);
  for (let i = 0; i < 1000; i++) {
    const v = f();
    assert.ok(v >= 0 && v < 1, `value out of range: ${v}`);
  }
});

test('different seeds diverge (determinism is not accidental equality)', () => {
  const a = seededRng(1);
  const b = seededRng(2);
  const da = Array.from({ length: 5 }, () => a());
  const db = Array.from({ length: 5 }, () => b());
  assert.notDeepEqual(da, db);
});

test('defaultRng returns Math.random and yields [0,1) values', () => {
  const f = defaultRng();
  assert.equal(f, Math.random);
  const v = f();
  assert.ok(v >= 0 && v < 1);
});

// --- leaderboard --------------------------------------------------------------

function memStorage(preload = null) {
  const data = { raw: preload };
  return {
    store: {
      load() {
        return data.raw; // may be null, an array, or a raw string
      },
      save(json) {
        data.raw = json;
      },
    },
    data,
  };
}

function clockFrom(start) {
  let t = start;
  return { now: () => (t += 1) };
}

test('leaderboard: 5 mixed scores -> top-3 order correct', () => {
  const { store } = memStorage([]);
  const lb = createLeaderboard({ storage: store, initial: [] });
  lb.submit(30);
  lb.submit(10);
  lb.submit(90);
  lb.submit(70);
  lb.submit(50);
  const list = lb.list();
  assert.deepEqual(list.slice(0, 3).map((e) => e.score), [90, 70, 50]);
  assert.equal(lb.best(), 90);
});

test('leaderboard: 12 submits -> list length clamps to 10', () => {
  const { store } = memStorage([]);
  const lb = createLeaderboard({ storage: store, initial: [] });
  for (let i = 1; i <= 12; i++) lb.submit(i * 10); // 10..120
  assert.equal(lb.list().length, 10);
  assert.equal(lb.best(), 120);
});

test('leaderboard: equal scores preserve insertion order (stable)', () => {
  const { store } = memStorage([]);
  const lb = createLeaderboard({ storage: store, initial: [], clock: clockFrom(0) });
  lb.submit(50); // A (at=1)
  lb.submit(80);
  lb.submit(50); // B equal to A, later
  lb.submit(70);
  const list = lb.list();
  // clock advances 1..4; the two 50s were submitted at t=1 (first) and t=3
  const fifties = list.filter((e) => e.score === 50).map((e) => e.at);
  assert.deepEqual(fifties, [1, 3], 'equal scores keep insertion order');
});

test('leaderboard: timestamps come from the injected clock', () => {
  const { store } = memStorage([]);
  const lb = createLeaderboard({ storage: store, initial: [], clock: clockFrom(1000) });
  lb.submit(10);
  lb.submit(20);
  const list = lb.list();
  // best()=20 is the *latest* submit -> clock now = 1002
  assert.equal(list[0].score, 20);
  assert.equal(list[0].at, 1002);
  assert.equal(list[1].at, 1001);
});

test('leaderboard: best() with no entries -> 0', () => {
  const { store } = memStorage([]);
  const lb = createLeaderboard({ storage: store, initial: [] });
  assert.equal(lb.best(), 0);
  assert.deepEqual(lb.list(), []);
});

test('leaderboard: throwing injected storage falls back to memory, submits still served', () => {
  const throwing = {
    load() {
      throw new Error('storage unavailable');
    },
    save() {
      throw new Error('storage unavailable');
    },
  };
  const lb = createLeaderboard({ storage: throwing, initial: [5] });
  assert.equal(lb.best(), 5, 'seed survives the broken load');
  lb.submit(50); // persist() throws -> memory fallback
  assert.equal(lb.best(), 50, 'subsequent submit served from memory');
  lb.submit(60);
  assert.equal(lb.best(), 60);
  assert.equal(lb.list()[0].score, 60);
});

test('leaderboard: default storage path constructs cleanly with no localStorage (Node)', () => {
  const hadLocalStorage = Object.hasOwn(globalThis, 'localStorage');
  const saved = globalThis.localStorage;
  delete globalThis.localStorage;
  try {
    const lb = createLeaderboard({ initial: [9] });
    assert.equal(lb.best(), 9);
    lb.submit(90);
    assert.equal(lb.best(), 90);
    assert.equal(lb.list()[0].score, 90);
  } finally {
    if (hadLocalStorage) globalThis.localStorage = saved;
  }
});

// --- quality ------------------------------------------------------------------

test('MOBILE_RE is the documented pattern', () => {
  assert.equal(MOBILE_RE.source, 'Android|iPhone|iPad|Mobile');
  assert.ok(MOBILE_RE.ignoreCase);
});

test('isMobileUA matches mobile agents, rejects desktop', () => {
  assert.ok(isMobileUA('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)'));
  assert.ok(isMobileUA('Mozilla/5.0 (Linux; Android 14) Mobile Safari'));
  assert.ok(isMobileUA('Mozilla/5.0 (iPad; CPU OS 17_0)'));
  assert.equal(isMobileUA('Mozilla/5.0 (Windows NT 10.0) Chrome/120'), false);
  assert.equal(isMobileUA(''), false);
  assert.equal(isMobileUA(null), false);
});

test('pickQuality: param wins over stored and device default', () => {
  assert.equal(pickQuality({ param: 'high', stored: 'low', isMobile: true }), 'high');
  assert.equal(pickQuality({ param: 'standard', stored: 'high' }), 'standard');
});

test('pickQuality: valid stored wins over the device default', () => {
  assert.equal(pickQuality({ stored: 'high', isMobile: true }), 'high');
  assert.equal(pickQuality({ stored: 'low', isMobile: false }), 'low');
});

test('pickQuality: invalid param falls through to stored/mobile', () => {
  assert.equal(pickQuality({ param: 'ultra', stored: 'standard', isMobile: true }), 'standard');
  assert.equal(pickQuality({ param: 'bogus', isMobile: true }), 'low');
  assert.equal(pickQuality({ param: 'bogus', isMobile: false }), 'standard');
});

test('pickQuality: mobile default low, desktop default standard', () => {
  assert.equal(pickQuality({ isMobile: true }), 'low');
  assert.equal(pickQuality({ isMobile: false }), 'standard');
  assert.equal(pickQuality({}), 'standard'); // no isMobile -> desktop default
});

test('tierConfig: exact map per R-PERF-01 for all three tiers', () => {
  assert.deepEqual(tierConfig('low'), {
    pixelRatio: 1,
    dust: 80,
    composer: false,
    shadows: 1024,
  });
  assert.deepEqual(tierConfig('standard'), {
    pixelRatio: 1.5,
    dust: 240,
    composer: 'smaa',
    shadows: 2048,
  });
  assert.deepEqual(tierConfig('high'), {
    pixelRatio: 2,
    dust: 500,
    composer: 'smaa+bloom',
    shadows: 2048,
  });
});

test('tierConfig: unknown tier throws', () => {
  assert.throws(() => tierConfig('ultra'));
  assert.throws(() => tierConfig(undefined));
  assert.throws(() => tierConfig(''));
});

test('tierConfig: returns a fresh copy each call (callers cannot mutate the map)', () => {
  const a = tierConfig('low');
  a.pixelRatio = 999;
  assert.equal(tierConfig('low').pixelRatio, 1, 'canonical map unaffected');
});
