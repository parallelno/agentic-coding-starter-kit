import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame,
  isWet,
  cellToWorld,
  GRID,
  TILE,
  TICK_MS,
  TICK_FLOOR_MS,
  POND_FACTOR,
  POND_R,
  POND_CX,
  POND_CY,
  MAX_BUFFER,
} from '../js/game/core.js';

// Local deterministic PRNG (mulberry32) so core tests never depend on the
// providers module or Math.random.
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const N = { c: 0, r: -1 };
const S = { c: 0, r: 1 };
const E = { c: 1, r: 0 };
const W = { c: -1, r: 0 };

function head(snap) {
  return snap.snake[0];
}

function onSnake(snap, c, r) {
  return snap.snake.some((s) => s.c === c && s.r === r);
}

function dryCells() {
  const cells = [];
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      if (!isWet(c, r)) cells.push({ c, r });
    }
  }
  return cells;
}

test('constants are exported with documented values', () => {
  assert.equal(GRID, 20);
  assert.equal(TILE, 1.0);
  assert.equal(TICK_MS, 160);
  assert.equal(POND_FACTOR, 0.45);
  assert.equal(TICK_FLOOR_MS, 60);
  assert.equal(MAX_BUFFER, 2);
  assert.equal(POND_R, 3.0);
});

test('cellToWorld maps cell to centered world coords', () => {
  assert.deepEqual(cellToWorld(10, 8), { x: 0.5, z: -1.5 });
  assert.deepEqual(cellToWorld(0, 0), { x: -9.5, z: -9.5 });
  assert.deepEqual(cellToWorld(19, 19), { x: 9.5, z: 9.5 });
});

test('isWet: pond disc + out-of-range guard + POND_R^2 ceiling', () => {
  assert.equal(isWet(POND_CX, POND_CY), true);
  // distance exactly == 3.0 (POND_R) is wet
  assert.equal(isWet(POND_CX + 3, POND_CY), true);
  assert.equal(isWet(POND_CX, POND_CY + 3), true);
  // distance just beyond 3.0 is dry
  assert.equal(isWet(POND_CX + 3, POND_CY + 1), false);
  // out of range is never wet
  assert.equal(isWet(-1, 0), false);
  assert.equal(isWet(0, -1), false);
  assert.equal(isWet(GRID, 0), false);
  assert.equal(isWet(0, GRID), false);
});

test('movement: N ticks without turns follow the heading; path not changed by wetness', () => {
  const g = createGame({ rng: mulberry32(1) });
  g.start();
  const snap0 = g.state();
  assert.equal(snap0.state, 'playing');
  assert.equal(snap0.snake.length, 3);
  assert.deepEqual(head(snap0), { c: 10, r: 8, pond: isWet(10, 8) });
  for (let i = 0; i < 5; i++) g.tick();
  const s = g.state();
  assert.deepEqual(head(s), { c: 10, r: 3, pond: isWet(10, 3) });
  assert.equal(s.state, 'playing');
});

test('buffer: two valid turns apply on successive ticks; third ignored', () => {
  const g = createGame({ rng: mulberry32(1) });
  g.start();
  // heading north
  g.turn(E); // buffer [E]
  g.turn(S); // buffer [E, S]
  g.tick(); // direction -> E, head (10,8)->(11,8)
  assert.deepEqual(head(g.state()), { c: 11, r: 8, pond: false });
  g.tick(); // direction -> S, head (11,8)->(11,9)
  assert.deepEqual(head(g.state()), { c: 11, r: 9, pond: false });
});

test('buffer: queuing a third turn while buffer full is ignored', () => {
  const g = createGame({ rng: mulberry32(1) });
  g.start();
  g.turn(E);
  g.turn(S);
  g.turn(W); // buffer already at MAX_BUFFER -> ignored
  g.tick();
  // If the 3rd turn were (wrongly) applied it would be a reversal; ensure the
  // second buffered turn (S) is what applied after the two steps.
  assert.deepEqual(head(g.state()), { c: 11, r: 8, pond: false });
  g.tick();
  assert.deepEqual(head(g.state()), { c: 11, r: 9, pond: false });
  // buffer is now empty and active direction is S; nothing stray queued
  const before = g.state();
  g.turn(E);
  g.turn(W); // reversal of S? S is (0,1); W is (-1,0) - not reversal, allowed
  // buffer capacity 2 -> both held
  assert.equal(before.state, 'playing');
});

test('reversal (180deg) against active direction is ignored', () => {
  const g = createGame({ rng: mulberry32(1) });
  g.start(); // heading north
  g.turn(S); // south = 180 of north -> ignored
  g.tick(); // still moving north
  assert.deepEqual(head(g.state()), { c: 10, r: 7, pond: false });
});

test('reversal against the first-buffered turn is ignored', () => {
  const g = createGame({ rng: mulberry32(1) });
  g.start(); // heading north
  g.turn(E); // buffer [E]
  g.turn(W); // 180 of the pending E -> rejected
  g.tick(); // applied E, head (10,8)->(11,8)
  assert.deepEqual(head(g.state()), { c: 11, r: 8, pond: false });
});

test('growth/eat: stepping into an adjacent food grows and scores 10', () => {
  const g = createGame({ rng: mulberry32(9) });
  g.start();
  const h = head(g.state());
  // Force food directly north of the head.
  g._s.food = { c: h.c, r: h.r - 1 };
  g.tick();
  const s = g.state();
  assert.equal(s.alive, true);
  assert.equal(s.snake.length, 4);
  assert.equal(s.score, 10);
  // New food must be dry and not on the snake.
  assert.ok(s.food, 'a new food cell is spawned');
  assert.equal(isWet(s.food.c, s.food.r), false);
  assert.equal(onSnake(s, s.food.c, s.food.r), false);
});

const speedCases = [
  [0, 160],
  [9, 160],
  [10, 159],
  [20, 158],
  [100, 150],
  [1000, 60],
  [5000, 60],
];
test('tickIntervalMs: score-based acceleration, floor clamp', () => {
  const g = createGame({ rng: mulberry32(1) });
  for (const [score, expected] of speedCases) {
    const snap = { score, snake: [{ c: 0, r: 0, pond: false }] };
    assert.equal(g.tickIntervalMs(snap), expected, `score ${score}`);
  }
});

test('tickIntervalMs: pond cell stretches the step by POND_FACTOR', () => {
  const g = createGame({ rng: mulberry32(1) });
  const dry = { score: 0, snake: [{ c: 0, r: 0, pond: false }] };
  const wet = { score: 0, snake: [{ c: POND_CX, r: POND_CY, pond: true }] };
  assert.equal(g.tickIntervalMs(dry), 160);
  assert.equal(g.tickIntervalMs(wet), 160 / POND_FACTOR);
  assert.ok(Math.abs(g.tickIntervalMs(wet) - 160 / 0.45) < 1e-9);
});

test('death at wall: state dead + correct deathCell', () => {
  const g = createGame({ rng: mulberry32(1) });
  g.start();
  // Heading north from r=8: 8 ticks reach the top wall; the 9th dies.
  for (let i = 0; i < 8; i++) g.tick();
  assert.equal(g.state().state, 'playing');
  assert.deepEqual(head(g.state()), { c: 10, r: 0, pond: false });
  g.tick();
  const s = g.state();
  assert.equal(s.state, 'dead');
  assert.equal(s.alive, false);
  assert.equal(s.won, false);
  assert.deepEqual(s.deathCell, { c: 10, r: -1 });
});

test('self-collision after a tight turn kills', () => {
  const g = createGame({ rng: mulberry32(1) });
  g.start();
  // Construct a body where the cell ahead of the head is a non-tail segment.
  g._s.snake = [
    { c: 5, r: 5, pond: false },
    { c: 5, r: 4, pond: false },
    { c: 5, r: 3, pond: false },
    { c: 6, r: 3, pond: false },
  ];
  g._s.direction = N;
  g._s.buffer = [];
  g._s.state = 'playing';
  g._s.food = { c: 0, r: 0 };
  g.tick();
  const s = g.state();
  assert.equal(s.state, 'dead');
  assert.equal(s.alive, false);
  assert.equal(s.won, false);
  // The head would have entered the (non-tail) body cell (5,4).
  assert.deepEqual(s.deathCell, { c: 5, r: 4 });
});

test('tail-vacate: entering the cell the tail just left (not growing) is safe', () => {
  const g = createGame({ rng: mulberry32(1) });
  g.start();
  // Head (6,5), mid (5,5), tail (6,4). Heading north -> next (6,4) is the tail
  // which vacates this tick (not growing) => safe.
  g._s.snake = [
    { c: 6, r: 5, pond: false },
    { c: 5, r: 5, pond: false },
    { c: 6, r: 4, pond: false },
  ];
  g._s.direction = N;
  g._s.buffer = [];
  g._s.state = 'playing';
  g._s.food = { c: 0, r: 0 }; // not in the path
  g.tick();
  const s = g.state();
  assert.equal(s.alive, true, 'no death when chasing the vacating tail');
  assert.equal(s.state, 'playing');
  assert.deepEqual(head(s), { c: 6, r: 4, pond: false });
  assert.equal(s.snake.length, 3);
});

test('win: filling the dry board produces won / dead / alive=false / deathCell null', () => {
  const g = createGame({ rng: mulberry32(0) }); // rng 0 -> always c0 r0
  const dry = dryCells();
  // Occupancy = every dry cell except the food target (0,0); head at its
  // neighbour (0,1) heading north so the next tick eats (0,0).
  const noTarget = dry.filter((c) => !(c.c === 0 && c.r === 0)) // 386 dry cells minus (0,0)
    .map((c) => ({ c: c.c, r: c.r, pond: false }));
  const body = noTarget.filter((c) => !(c.c === 0 && c.r === 1));
  g._s.snake = [{ c: 0, r: 1, pond: false }, ...body];
  g._s.direction = N;
  g._s.buffer = [];
  g._s.state = 'playing';
  g._s.food = { c: 0, r: 0 };
  g._s.score = (g._s.snake.length - 3) * 10;
  g.tick();
  const s = g.state();
  assert.equal(s.won, true);
  assert.equal(s.state, 'dead');
  assert.equal(s.alive, false);
  assert.equal(s.deathCell, null);
  assert.equal(s.food, null);
});

test('determinism: identical rng sequence -> identical head path + food cells', () => {
  const g1 = createGame({ rng: mulberry32(1234) });
  const g2 = createGame({ rng: mulberry32(1234) });
  const script = [E, E, S, S, W, W, N, N]; // weave to stay off the wall
  g1.start();
  g2.start();
  const heads1 = [];
  const heads2 = [];
  const foods1 = [];
  const foods2 = [];
  for (let i = 0; i < 20; i++) {
    if (i % 3 === 0) {
      const d = script[(i / 3) % script.length | 0];
      g1.turn(d);
      g2.turn(d);
    }
    g1.tick();
    g2.tick();
    heads1.push(head(g1.state()).c + ',' + head(g1.state()).r);
    heads2.push(head(g2.state()).c + ',' + head(g2.state()).r);
    const f1 = g1.state().food;
    const f2 = g2.state().food;
    foods1.push(f1 ? f1.c + ',' + f1.r : 'null');
    foods2.push(f2 ? f2.c + ',' + f2.r : 'null');
  }
  assert.deepEqual(heads1, heads2);
  assert.deepEqual(foods1, foods2);
  // The two runs must actually have eaten / moved (not frozen at start).
  assert.notEqual(heads1[0], heads1[heads1.length - 1]);
});

test('dry-spawn: every spawned food is dry and not on the snake', () => {
  const g = createGame({ rng: mulberry32(7) });
  g.start();
  let snap = g.state();
  assert.ok(snap.food);
  assert.equal(isWet(snap.food.c, snap.food.r), false);
  assert.equal(onSnake(snap, snap.food.c, snap.food.r), false);
  for (let i = 0; i < 6; i++) {
    const h = head(g.state());
    // Force food one cell north; the next tick eats it and respawns.
    g._s.food = { c: h.c, r: h.r - 1 };
    g.tick();
    snap = g.state();
    assert.equal(snap.alive, true, `tick ${i} alive`);
    assert.ok(snap.food, 'food respawned');
    assert.equal(isWet(snap.food.c, snap.food.r), false, 'respawned food is dry');
    assert.equal(onSnake(snap, snap.food.c, snap.food.r), false, 'respawned food not on snake');
  }
});
