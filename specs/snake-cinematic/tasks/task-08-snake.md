# Task 08 — Snake (game state, data only)

- **Wave:** 3
- **Files to create:** `js/game/snake.js`
- **Depends on:** `js/game/grid.js` (W2), `js/config/constants.js` (W1).

## Description

The pure snake model: its body as an array of cells, direction, growing, and
the collision queries used by the state machine. It holds **no** rendering and
does **not** call `bus` — the state machine (task-17) drives `step()` and reads
results. Keep it deterministic and allocation-light so it is trivial to reason
about and to unit-test.

## Technical spec

```js
import { stepCell, inBounds } from '../game/grid.js';
import { CENTER, SNAKE_START_LENGTH } from '../config/constants.js';

export class Snake {
  constructor() {
    this.reset();
  }
  reset() {
    this.body  = [];              // head first; array of {col,row}
    this.dir   = 'RIGHT';
    this.grow  = 0;
    for (let i = 0; i < SNAKE_START_LENGTH; i++)
      this.body.push({ col: CENTER.col - i, row: CENTER.row });
    this.bodyKey = new Set(this.body.map(c => `${c.col},${c.row}`));
  }
  get head()  { return this.body[0]; }
  get length(){ return this.body.length; }
  // Apply the next direction (already validated by state: not 180° reversal).
  setDir(dir) { this.dir = dir; }
  // Advance one cell. Returns { died, reason } where reason is 'wall'|'self'|null.
  step() {
    const h = this.head;
    const next = stepCell(h.col, h.row, this.dir);
    const wall = !inBounds(next.col, next.row);
    if (!wall) {
      // self-collision: ignore the tail cell if we are NOT growing (tail moves)
      const willGrow = this.grow > 0;
      const movingIntoTail =
        !willGrow && this.body.length > 1 &&
        this.body[this.body.length - 1].col === next.col &&
        this.body[this.body.length - 1].row === next.row;
      if (this.bodyKey.has(`${next.col},${next.row}`) && !movingIntoTail)
        return { died: true, reason: 'self' };
    }
    this.body.unshift(next);
    this.bodyKey.delete(`${this.body[this.body.length-1].col},${this.body[this.body.length-1].row}`);
    this.bodyKey.add(`${next.col},${next.row}`);
    if (this.grow > 0) { this.grow--; this.bodyKey.add(`${this.body[this.body.length-1].col},${this.body[this.body.length-1].row}`); }
    else this.body.pop();
    return { died: wall, reason: wall ? 'wall' : null };
  }
  eat(amount = 1) { this.grow += amount; }
}
```

- `bodyKey` is a `Set` of cell keys for O(1) self-collision.
- The "moving into tail" exception: because the tail cell vacates on a non-grow
  step, stepping onto the current tail cell is legal (classic snake rule).
- Keep `step()` free of per-call object churn where practical (the small return
  object is acceptable).

## Acceptance criteria
- Initial snake is length 3: head at center (10,10), body cells extend toward
  -col (west), `dir === 'RIGHT'` so it travels away from its tail toward +col
  (east); all cells in bounds.
- `step()` moves the head one cell and advances the body; length constant.
- Hitting a wall returns `{died:true, reason:'wall'}`.
- Stepping into the body (when length ≥ 3) returns `{reason:'self'}`; stepping
  into the currently-vacating tail cell does **not** die.
- After `eat(1)`, the next `step()` keeps length + 1.
