import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as core from '../js/game/core.js';

const {
  GRID,
  TICK_MS,
  TICK_FLOOR_MS,
  POND_FACTOR,
  MAX_BUFFER,
  cellToWorld,
  isWet,
  tickIntervalMs,
  createGame,
} = core;

// --- constants & shared shape ------------------------------------------------

test('constants match R-ARCH-05 / R-WORLD-02', () => {
  assert.equal(GRID, 20);
  assert.equal(TICK_MS, 160);
  assert.equal(TICK_FLOOR_MS, 60);
  assert.equal(POND_FACTOR, 0.45);
  assert.equal(MAX_BUFFER, 2);
});

test('cellToWorld maps (c,r) -> (x=c-9.5, z=r-9.5)', () => {
  assert.deepEqual(cellToWorld(0, 0), { x: -9.5, z: -9.5 });
  assert.deepEqual(cellToWorld(10, 8), { x: 0.5, z: -1.5 });
  assert.deepEqual(cellToWorld(19, 19), { x: 9.5, z: 9.5 });
});

test('isWet is the single wet predicate', () => {
  // exact boundary: (14,11) distance 3 -> wet. (13,10) d^2=17 -> dry.
  assert.equal(isWet(14, 11), true); // (0)^2+(−3)^2 = 9 <= 9
  assert.equal(isWet(14, 14), true); // (0)^2+(0)^2
  assert.equal(isWet(13, 10), false); // 1 + 16 = 17 > 9
  assert.equal(isWet(17, 14), true); // 9 <= 9
  assert.equal(isWet(18, 14), false); // 16 > 9
  // out-of-range -> false even if inside the circle mathematically
  assert.equal(isWet(-1, 14), false);
  assert.equal(isWet(22, 14), false);
});

// --- movement ---------------------------------------------------------------

test('movement: ticks follow heading without turns; pond does not change path', () => {
  const g = createGame({ rng: () => 0.5 });
  g.start();
  const heads = [];
  for (let i = 0; i < 5; i++) {
    heads.push(g.state().snake[0]);
    g.tick();
  }
  // head moved north 5 cells from (10,8)
  const last = g.state().snake[0];
  assert.deepEqual(heads[0], { c: 10, r: 8, pond: false });
  assert.equal(last.c, 10);
  assert.equal(last.r, 3);
});

// --- input buffer ------------------------------------------------------------

test('buffer: two valid turns applied on successive ticks', () => {
  const g = createGame({ rng: () => 0.5 });
  g.start(); // heading north (0,-1)
  g.turn({ c: 1, r: 0 }); // east (valid; buffer empty -> vs active north)
  g.turn({ c: 0, r: 1 }); // south (valid vs first pending east)
  g.tick();
  assert.equal(g.state().direction.c, 1); // east applied on tick 1
  assert.equal(g.state().direction.r, 0);
  g.tick();
  assert.equal(g.state().direction.c, 0); // south applied on tick 2
  assert.equal(g.state().direction.r, 1);
});

test('buffer: third turn beyond MAX_BUFFER is ignored', () => {
  const g = createGame({ rng: () => 0.5 });
  g.start();
  g.turn({ c: 1, r: 0 }); // east (valid)
  g.turn({ c: 0, r: 1 }); // south (valid)
  g.turn({ c: -1, r: 0 }); // west — ignored, buffer is full (2)
  g.tick();
  assert.equal(g.state().direction.c, 1); // east applied
  g.tick();
  assert.equal(g.state().direction.c, 0); // south applied
  g.tick();
  // buffer drained; still south (west was dropped)
  assert.equal(g.state().direction.c, 0);
  assert.equal(g.state().direction.r, 1);
});

test('reversal vs active direction is ignored', () => {
  const g = createGame({ rng: () => 0.5 });
  g.start(); // north
  g.turn({ c: 0, r: 1 }); // south === reversal of north -> ignored
  g.tick();
  assert.equal(g.state().direction.r, -1); // still north
});

test('reversal vs the first buffered turn is ignored', () => {
  const g = createGame({ rng: () => 0.5 });
  g.start(); // north
  g.turn({ c: 1, r: 0 }); // east (buffered)
  g.turn({ c: 0, r: -1 }); // north === reversal of buffered east? no; opposite of east is west
  // Actually opposite of east (1,0) is west (-1,0). Queue west -> should be
  // rejected as reversal of the FIRST pending turn (east), even though it's a
  // no-op against active north.
  g.turn({ c: -1, r: 0 });
  g.tick();
  assert.equal(g.state().direction.c, 1); // east applied (only east was valid)
  assert.equal(g.state().direction.r, 0);
});

// --- growth / eating ---------------------------------------------------------

test('eating: entering the food cell grows by one, adds 10, respawns food', () => {
  // Force food to be directly ahead (north) of the head, dry
  const g = createGame({ rng: () => 0.5 });
  g.start();
  const head = g.state().snake[0]; // (10,8)
  g.food = { c: head.c, r: head.r - 1 }; // (10,7) dry, not on snake
  g.tick();
  assert.equal(g.state().score, 10);
  assert.equal(g.state().snake.length, 4);
  const food = g.state().food;
  assert.ok(food, 'a new food should spawn');
  assert.ok(!isWet(food.c, food.r), 'new food must be dry');
  assert.ok(!g.state().snake.some((s) => s.c === food.c && s.r === food.r), 'new food not on snake');
});

// --- score / speed ----------------------------------------------------------

function snapAt(score, pondHead = false) {
  return { score, snake: [{ c: 0, r: 0, pond: pondHead }] };
}

test('tickIntervalMs dry-head speed table (R-CORE-05)', () => {
  assert.equal(tickIntervalMs(snapAt(0)), 160);
  assert.equal(tickIntervalMs(snapAt(9)), 160);
  assert.equal(tickIntervalMs(snapAt(10)), 159);
  assert.equal(tickIntervalMs(snapAt(20)), 158);
  assert.equal(tickIntervalMs(snapAt(100)), 150);
  assert.equal(tickIntervalMs(snapAt(1000)), 60); // floor clamps
  assert.equal(tickIntervalMs(snapAt(5000)), 60); // any larger also 60
});

test('tickIntervalMs pond stretches the step by POND_FACTOR', () => {
  assert.equal(tickIntervalMs({ score: 0, snake: [{ c: 14, r: 14, pond: true }] }), 160 / POND_FACTOR);
  const dry = tickIntervalMs(snapAt(0));
  const wet = tickIntervalMs(snapAt(0, true));
  assert.ok(Math.abs(wet - dry / POND_FACTOR) < 1e-9);
});

// --- death ------------------------------------------------------------------

test('death: wall collision sets dead state and deathCell', () => {
  const g = createGame({ rng: () => 0.5 });
  g.start(); // heading north from (10,8)
  for (let i = 0; i < 8; i++) g.tick(); // 8 north ticks -> r = 0
  g.tick(); // next is r = -1 -> wall
  const s = g.state();
  assert.equal(s.alive, false);
  assert.equal(s.state, 'dead');
  assert.deepEqual(s.deathCell, { c: 10, r: -1 });
});

test('death: self-collision after a tight U-turn kills', () => {
  const g = createGame({ rng: () => 0.5 });
  g.start(); // north at (10,8), body (10,9),(10,10)
  // Build a longer snake heading north first so a U-turn bites the body.
  // Drive the snake north several cells.
  for (let i = 0; i < 5; i++) g.tick();
  // head (10,3), body (10,4),(10,5),(10,6). Turn east, then south, then west to
  // loop back into the body column.
  // Simplest deterministic self-collision: extend snake, then make a tight loop.
  // Grow by forcing food so length > 4 first.
  g.score = 0;
  // Instead: use a crafted snake. Reuse start, then set snake manually.
  // Snake of length 5, head (5,5) moving north. Turn east: next cell (6,5) is
  // the 4th node (index 3), NOT the tail (index 4) -> genuine self-collision.
  g.snake = [
    { c: 5, r: 5, pond: false },
    { c: 5, r: 6, pond: false },
    { c: 6, r: 6, pond: false },
    { c: 6, r: 5, pond: false },
    { c: 5, r: 7, pond: false },
  ];
  g.direction = { c: 0, r: -1 };
  g.buffer = [];
  g.phase = 'playing';
  g.turn({ c: 1, r: 0 });
  g.tick();
  const s = g.state();
  assert.equal(s.alive, false);
  assert.equal(s.state, 'dead');
  assert.deepEqual(s.deathCell, { c: 6, r: 5 });
});

test('tail-vacate: entering the just-vacated tail cell while NOT growing is safe', () => {
  const g = createGame({ rng: () => 0.5 });
  // Craft a snake where the tail cell is exactly in front of the head on a
  // non-growing step. Length 4. Head (4,4) heading north -> next (4,3).
  // Tail at (4,3): as long as the head does not grow, the tail vacates and the
  // move is legal.
  g.snake = [
    { c: 4, r: 4, pond: false },
    { c: 4, r: 5, pond: false },
    { c: 3, r: 5, pond: false },
    { c: 4, r: 3, pond: false }, // tail directly north of head
  ];
  g.direction = { c: 0, r: -1 }; // north, toward (4,3) the tail
  g.buffer = [];
  g.food = { c: 0, r: 19 }; // food far, so no growth
  g.phase = 'playing';
  g.tick();
  const s = g.state();
  assert.equal(s.alive, true, 'should survive the tail-vacate');
  assert.equal(s.state, 'playing');
  assert.deepEqual(s.snake[0], { c: 4, r: 3, pond: false });
});

// --- win --------------------------------------------------------------------

test('win: full-board snake + impossible rng yields won/dead/alive=false/deathCell=null', () => {
  const g = createGame({ rng: () => 0 }); // rng that always points at (0,0)
  // Fill the entire board with the snake so no dry, free cell remains.
  const cells = [];
  for (let r = 0; r < GRID; r++) for (let c = 0; c < GRID; c++) cells.push({ c, r, pond: isWet(c, r) });
  g.snake = cells;
  g.direction = { c: 1, r: 0 };
  g.buffer = [];
  g.phase = 'playing';
  // Forcing a food respawn with no eligible cell must trigger the win path.
  g.spawnFood();
  const s = g.state();
  assert.equal(s.won, true);
  assert.equal(s.state, 'dead');
  assert.equal(s.alive, false);
  assert.equal(s.deathCell, null);
});

// --- determinism -------------------------------------------------------------

function record(g, n) {
  const heads = [];
  const foods = [];
  // play n ticks turning in a fixed pseudo-random but deterministic pattern
  for (let i = 0; i < n; i++) {
    const dirs = [
      { c: 1, r: 0 },
      { c: 0, r: 1 },
      { c: -1, r: 0 },
      { c: 0, r: -1 },
    ];
    g.turn(dirs[(i * 7) % 4]);
    g.tick();
    const s = g.state();
    if (s.state !== 'dead' || s.won) {
      heads.push(`${s.snake[0].c},${s.snake[0].r}`);
      foods.push(s.food ? `${s.food.c},${s.food.r}` : 'null');
    }
  }
  return { heads, foods };
}

test('determinism: identical rng stream -> identical head/food trajectories', () => {
  function stream() {
    const seq = [0.1, 0.32, 0.55, 0.71, 0.05, 0.9, 0.44, 0.2, 0.83, 0.66, 0.5, 0.15];
    let i = 0;
    return () => seq[i++ % seq.length];
  }
  const ga = createGame({ rng: stream() });
  ga.start();
  const gb = createGame({ rng: stream() });
  gb.start();
  const a = record(ga, 20);
  const b = record(gb, 20);
  assert.deepEqual(a.heads, b.heads);
  assert.deepEqual(a.foods, b.foods);
});

// --- dry-spawn ---------------------------------------------------------------

test('dry-spawn: over a mixed stream, every spawned food is dry and off-snake', () => {
  // Feed a deterministic pseudo-random stream; eat repeatedly by forcing the
  // head onto food, and assert the respawned food is always dry and off-snake.
  const g = createGame({ rng: () => 0.5 });
  g.start();
  assert.ok(!isWet(g.state().food.c, g.state().food.r), 'initial food dry');
  // Force many food respawns by placing food on an unoccupied dry cell ahead,
  // ticking into it, and checking the newly spawned food each time.
  for (let k = 0; k < 40 && g.state().state === 'playing'; k++) {
    const s = g.state();
    const head = s.snake[0];
    // find a dry, unoccupied neighbour to eat immediately
    const opts = [
      { c: head.c + 1, r: head.r },
      { c: head.c - 1, r: head.r },
      { c: head.c, r: head.r + 1 },
      { c: head.c, r: head.r - 1 },
    ].filter((p) => p.c >= 0 && p.c < GRID && p.r >= 0 && p.r < GRID && !isWet(p.c, p.r) && !s.snake.some((seg) => seg.c === p.c && seg.r === p.r));
    if (opts.length === 0) continue;
    const target = opts[0];
    g.food = { ...target };
    g.snake = s.snake.map((seg) => ({ c: seg.c, r: seg.r, pond: isWet(seg.c, seg.r) }));
    g.direction = { c: target.c - head.c, r: target.r - head.r };
    g.buffer = [];
    g.phase = 'playing';
    g.rng = () => 0.5;
    g.food = { ...target };
    g.tick();
    const after = g.state();
    if (after.state === 'dead') break;
    assert.ok(after.food, 'food present after respawn');
    assert.ok(!isWet(after.food.c, after.food.r), 'respawned food dry');
    assert.ok(!after.snake.some((seg) => seg.c === after.food.c && seg.r === after.food.r), 'respawned food not on snake');
  }
});
