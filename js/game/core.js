// js/game/core.js — pure snake rules (T02). No node builtins, no DOM, no three.
// Shared snake snapshot shape + grid constants live here (R-ARCH-05, R-WORLD-02).

export const GRID = 20;
export const TILE = 1.0;
export const TICK_MS = 160;
export const POND_FACTOR = 0.45;
export const TICK_FLOOR_MS = 60;
export const MAX_BUFFER = 2;

export const POND_CX = 14;
export const POND_CY = 14;
export const POND_R = 3.0;
const POND_R_SQR = POND_R * POND_R; // (c-14)^2 + (r-14)^2 <= 9

const NORTH = { c: 0, r: -1 };

function inBounds(c, r) {
  return c >= 0 && c < GRID && r >= 0 && r < GRID;
}

/** (c, r) -> world center. x = c - 9.5, z = r - 9.5. */
export function cellToWorld(c, r) {
  return { x: c - 9.5, z: r - 9.5 };
}

/**
 * Single wet predicate (R-WORLD-02). Out-of-range cells are dry (false).
 * Wet iff (c-14)^2 + (r-14)^2 <= 9.
 */
export function isWet(c, r) {
  if (!inBounds(c, r)) return false;
  const dx = c - POND_CX;
  const dy = r - POND_CY;
  return dx * dx + dy * dy <= POND_R_SQR;
}

// Effective ms per step for a snapshot (R-CORE-02 / R-CORE-05).
// base = max(TICK_FLOOR_MS, TICK_MS - floor(score / 10)); pond stretches it.
export function tickIntervalMs(snap) {
  const base = Math.max(TICK_FLOOR_MS, TICK_MS - Math.floor(snap.score / 10));
  const pond = snap.snake && snap.snake.length > 0 ? !!snap.snake[0].pond : false;
  return pond ? base / POND_FACTOR : base;
}

function snakeCell(c, r) {
  return { c, r, pond: isWet(c, r) };
}

// Length-3 snake centered, heading north. Head (10, 8), body behind (10, 9, 10).
function initialSnake() {
  return [snakeCell(10, 8), snakeCell(10, 9), snakeCell(10, 10)];
}

function isOccupied(snake, c, r) {
  for (let i = 0; i < snake.length; i++) {
    if (snake[i].c === c && snake[i].r === r) return true;
  }
  return false;
}

/**
 * Place food on a uniformly random dry, non-snake cell using g.rng.
 * Randomly draws up to 1000 times, then scans the full grid in fixed order as a
 * deterministic fallback. If no eligible cell remains -> terminal win.
 */
function spawnFood(g) {
  const occupied = (c, r) => isWet(c, r) || isOccupied(g.snake, c, r);

  for (let i = 0; i < 1000; i++) {
    const c = Math.floor(g.rng() * GRID);
    const r = Math.floor(g.rng() * GRID);
    if (!occupied(c, r)) {
      g.food = { c, r };
      return;
    }
  }
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      if (!occupied(c, r)) {
        g.food = { c, r };
        return;
      }
    }
  }
  // No eligible cell: terminal win (dead state, won, no deathCell / dolly).
  g.food = null;
  g.won = true;
  g.alive = false;
  g.phase = 'dead';
  g.deathCell = null;
}

function snapshot(g) {
  return {
    state: g.phase,
    snake: g.snake.map((s) => ({ c: s.c, r: s.r, pond: s.pond })),
    direction: { c: g.direction.c, r: g.direction.r },
    food: g.food ? { c: g.food.c, r: g.food.r } : null,
    score: g.score,
    alive: g.alive,
    won: g.won,
    deathCell: g.deathCell ? { c: g.deathCell.c, r: g.deathCell.r } : null,
  };
}

/**
 * createGame({ rng }) -> game.
 *
 * The returned object exposes the live model fields directly (snake, direction,
 * food, score, won, alive, deathCell, buffer, phase, rng) so deterministic
 * tests can control setup, plus the state-machine methods. `state()` returns a
 * deep-ish copy of the shared snapshot shape (R-ARCH-05) with `won` and
 * `deathCell` (null on win).
 */
export function createGame(opts = {}) {
  const rng = opts.rng ? opts.rng : Math.random;

  const g = {
    rng,
    snake: initialSnake(),
    direction: { ...NORTH },
    buffer: [],
    food: null,
    score: 0,
    alive: true,
    won: false,
    deathCell: null,
    phase: 'menu', // internal game-state string; exposed via state().state

    state() {
      return snapshot(g);
    },

    // menu | dead -> playing (fresh layout: re-place snake, recompute pond, food).
    start() {
      if (g.phase !== 'menu' && g.phase !== 'dead') return snapshot(g);
      g.snake = initialSnake();
      g.direction = { ...NORTH };
      g.buffer = [];
      g.score = 0;
      g.alive = true;
      g.won = false;
      g.deathCell = null;
      spawnFood(g);
      g.phase = 'playing';
      return snapshot(g);
    },

    pause() {
      if (g.phase === 'playing') g.phase = 'paused';
      return snapshot(g);
    },

    // paused -> playing only.
    resume() {
      if (g.phase === 'paused') g.phase = 'playing';
      return snapshot(g);
    },

    /**
     * Queue a turn (R-CORE-02). Reversal is rejected against the effective next
     * direction: the first buffered turn if any are pending, else the active
     * direction. Buffer capped at MAX_BUFFER.
     */
    turn(dir) {
      if (!dir) return snapshot(g);
      const ref = g.buffer.length > 0 ? g.buffer[0] : g.direction;
      if (dir.c === -ref.c && dir.r === -ref.r) return snapshot(g); // reversal
      if (g.buffer.length < MAX_BUFFER) g.buffer.push({ c: dir.c, r: dir.r });
      return snapshot(g);
    },

    /**
     * Advance one cell. Only advances while `playing`. Applies eating, growth,
     * and death (wall / self-collision with the R-CORE-04 tail-vacate rule).
     */
    tick() {
      if (g.phase !== 'playing') return snapshot(g);

      if (g.buffer.length > 0) g.direction = g.buffer.shift();

      const head = g.snake[0];
      const nc = head.c + g.direction.c;
      const nr = head.r + g.direction.r;

      // Wall collision (R-CORE-04): next cell out of 0..19 is a loss.
      if (!inBounds(nc, nr)) {
        g.alive = false;
        g.phase = 'dead';
        g.deathCell = { c: nc, r: nr };
        return snapshot(g);
      }

      const willEat = !!g.food && nc === g.food.c && nr === g.food.r;
      const grow = willEat;

      // Body collision. The tail (last cell) is free on a non-growing tick.
      for (let i = 1; i < g.snake.length; i++) {
        if (!grow && i === g.snake.length - 1) continue;
        const seg = g.snake[i];
        if (seg.c === nc && seg.r === nr) {
          g.alive = false;
          g.phase = 'dead';
          g.deathCell = { c: nc, r: nr };
          return snapshot(g);
        }
      }

      g.snake.unshift(snakeCell(nc, nr));
      if (!grow) g.snake.pop();

      if (willEat) {
        g.score += 10;
        spawnFood(g); // may set the terminal win state
      }

      return snapshot(g);
    },

    // Internal spawn (also reachable by tests to exercise the full-board win path).
    spawnFood() {
      spawnFood(g);
      return snapshot(g);
    },
  };

  spawnFood(g); // initial food (board has room -> never wins at construction)
  return g;
}
