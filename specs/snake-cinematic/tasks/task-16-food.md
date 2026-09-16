# Task 16 — Food (spawner)

- **Wave:** 4
- **Files to create:** `js/game/food.js`
- **Depends on:** `js/game/grid.js` (W2), `js/config/constants.js` (W1),
  `js/renderer/water.js` (W3, `isWater` to avoid spawning in water).

## Description

Spawns a single food item on a random in-bounds cell that is not occupied by
the snake and **not on water** (food must not be in the wet cells). Exposes the
current food cell and an `eaten` check. Pure logic + the cell; rendering is
handled by the integration (a simple glowing sphere) or optionally here — keep
this module focused on the *where*, not the look.

## Technical spec

```js
import { inBounds } from '../game/grid.js';
import { GRID } from '../config/constants.js';

export class Food {
  constructor(water) { this.water = water; this.cell = null; }
  isEaten(col, row) { return this.cell && this.cell.col === col && this.cell.row === row; }
  // occupied: array of {col,row} (snake.body) of cells taken by the snake.
  // The state machine calls this once it has the snake, then after every eat.
  spawn(occupied) {
    this.cell = null;
    const taken = new Set();
    (occupied || []).forEach(c => taken.add(`${c.col},${c.row}`));
    let tries = 0;
    do {
      const col = (Math.random() * GRID.W) | 0;
      const row = (Math.random() * GRID.H) | 0;
      const key = `${col},${row}`;
      if (!inBounds(col, row)) continue;
      if (taken.has(key)) continue;
      if (this.water && this.water.isWater(col, row)) continue;
      this.cell = { col, row };
      break;
    } while (++tries < 1000);
    if (!this.cell) {
      // fallback: deterministic dry non-occupied cell scan (should rarely happen)
      this.cell = this._fallbackScan(taken);
    }
    return this.cell;
  }
}
```
The state machine calls `spawn(snake.body)` at game start and after every eat.
Implement `_fallbackScan(taken)` as a linear scan over all cells returning the
first in-bounds, dry, non-occupied cell (the game must never run without food).

Export a small visual helper the integration may use:
```js
import { toWorld } from '../game/grid.js';
export function foodWorld(cell) { return toWorld(cell.col, cell.row); }
```

## Acceptance criteria
- `spawn` never returns an out-of-bounds cell, a water cell, or a cell occupied
  by the snake.
- Calling `spawn` repeatedly with the same full-coverage body eventually relies
  on the fallback and still returns a valid free cell (no infinite loop).
- `isEaten(col,row)` true only when the head is exactly on the food cell.
- Deterministic, allocation-light (rebuild the `taken` Set only on spawn).
