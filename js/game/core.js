// SNAKE — Cinematic Edition: core deterministic rules.
// Zero-dependency pure logic. No DOM, no node builtins, no three.
// This is the single source of truth for the snake state machine and the
// R-ARCH-05 shared snapshot shape consumed by every other layer.

export const GRID = 20;
export const TILE = 1.0;
export const TICK_MS = 160;
export const POND_FACTOR = 0.45;
export const TICK_FLOOR_MS = 60;
export const MAX_BUFFER = 2;
export const POND_CX = 14;
export const POND_CY = 14;
export const POND_R = 3.0;

// Cell (c, r) -> world (x, z). Grid is 20x20 centered at the origin, so cell
// centers range from -9.5 .. +9.5 on both axes. "Up" on screen is -r / -z.
export function cellToWorld(c, r) {
  return { x: c - (GRID / 2 - 0.5), z: r - (GRID / 2 - 0.5) };
}

// Wet cells (the pond) are the single source of truth for: core tick slowdown,
// food spawn (food never appears in the pond), and the water visuals.
// A cell is wet when its squared distance from the pond centre <= POND_R^2.
// Out-of-range cells are never wet.
export function isWet(c, r) {
  if (c < 0 || r < 0 || c >= GRID || r >= GRID) return false;
  const dx = c - POND_CX;
  const dy = r - POND_CY;
  return dx * dx + dy * dy <= Math.ceil(POND_R * POND_R);
}

function dirOpposite(a, b) {
  return a.c === -b.c && a.r === -b.r;
}

export function createGame({ rng = Math.random } = {}) {
  const s = makeInitialState();

  function makeInitialState() {
    // Length-3 snake centred, heading north (r decreasing). Body behind the
    // head (in +r). Head at {c:10, r:8}.
    const cells = [
      { c: 10, r: 8 },
      { c: 10, r: 9 },
      { c: 10, r: 10 },
    ].map((cell) => ({ c: cell.c, r: cell.r, pond: isWet(cell.c, cell.r) }));
    return {
      snake: cells,
      direction: { c: 0, r: -1 },
      food: null,
      score: 0,
      alive: true,
      won: false,
      state: 'menu', // menu | playing | paused | dead
      deathCell: null,
      buffer: [],
    };
  }

  function occupy(c, r) {
    return s.snake.some((seg) => seg.c === c && seg.r === r);
  }

  // Uniformly random DRY cell not occupied by the snake. After 1000 rng draws
  // with no success, fall back to a deterministic full-grid scan (fixed order).
  // If no eligible cell exists the board is full -> win. Returns true if a food
  // cell was placed, false if the snake fills the board (win).
  function spawnFood() {
    for (let i = 0; i < 1000; i++) {
      const c = Math.floor(rng() * GRID);
      const r = Math.floor(rng() * GRID);
      if (!isWet(c, r) && !occupy(c, r)) {
        s.food = { c, r };
        return true;
      }
    }
    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        if (!isWet(c, r) && !occupy(c, r)) {
          s.food = { c, r };
          return true;
        }
      }
    }
    // No dry, unoccupied cell remains -> the snake has filled the board. Win.
    s.food = null;
    s.won = true;
    s.alive = false;
    s.state = 'dead';
    s.deathCell = null;
    return false;
  }

  function die(cell) {
    s.alive = false;
    s.state = 'dead';
    s.deathCell = cell; // a wall/body death is never a win (won stays false)
  }

  const game = {
    start() {
      if (s.state !== 'menu' && s.state !== 'dead') return;
      Object.assign(s, makeInitialState());
      s.state = 'playing';
      spawnFood();
    },

    pause() {
      if (s.state !== 'playing') return;
      s.state = 'paused';
    },

    resume() {
      if (s.state !== 'paused') return;
      s.state = 'playing';
    },

    turn(dir) {
      // Buffer up to MAX_BUFFER pending turns. A 180-degree reversal against
      // the direction the snake will be moving just before this turn applies is
      // rejected (that would instantly reverse into the body).
      if (s.buffer.length >= MAX_BUFFER) return;
      const prev = s.buffer.length ? s.buffer[s.buffer.length - 1] : s.direction;
      if (dirOpposite(dir, prev)) return;
      s.buffer.push(dir);
    },

    tick() {
      if (s.state !== 'playing') return;
      if (s.buffer.length) s.direction = s.buffer.shift();

      const head = s.snake[0];
      const next = { c: head.c + s.direction.c, r: head.r + s.direction.r };

      // Wall: next cell out of bounds -> death.
      if (next.c < 0 || next.r < 0 || next.c >= GRID || next.r >= GRID) {
        die(next);
        return;
      }

      const grew = s.food && next.c === s.food.c && next.r === s.food.r;
      // The tail cell is vacated this tick unless we grow, so it is only an
      // obstacle when growing.
      const body = grew ? s.snake : s.snake.slice(0, s.snake.length - 1);
      if (body.some((seg) => seg.c === next.c && seg.r === next.r)) {
        die(next);
        return;
      }

      s.snake = [
        { c: next.c, r: next.r, pond: isWet(next.c, next.r) },
        ...(grew ? s.snake : s.snake.slice(0, s.snake.length - 1)),
      ];
      s.score = (s.snake.length - 3) * 10;

      if (grew) {
        spawnFood();
      }
    },

    state() {
      return {
        state: s.state,
        snake: s.snake.map((seg) => ({ c: seg.c, r: seg.r, pond: seg.pond })),
        direction: { c: s.direction.c, r: s.direction.r },
        food: s.food ? { c: s.food.c, r: s.food.r } : null,
        score: s.score,
        alive: s.alive,
        won: s.won,
        deathCell: s.deathCell ? { c: s.deathCell.c, r: s.deathCell.r } : null,
      };
    },

    tickIntervalMs(snap) {
      const base = Math.max(TICK_FLOOR_MS, TICK_MS - Math.floor(snap.score / 10));
      return snap.snake[0] && snap.snake[0].pond ? base / POND_FACTOR : base;
    },

    // Test seam: exposes the live internal state object (not a snapshot). Lets
    // unit tests position the snake to probe death / tail-vacate / win paths
    // that are awkward to reach through the public turn/tick API alone.
    _s: s,
  };

  spawnFood();
  return game;
}
