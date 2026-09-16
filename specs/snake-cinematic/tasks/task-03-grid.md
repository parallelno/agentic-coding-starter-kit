# Task 03 — Grid Math

- **Wave:** 2
- **Files to create:** `js/game/grid.js`
- **Depends on:** `js/config/constants.js` (GRID, DIRECTION, CELL mapping).

## Description

Pure, side-effect-free grid utilities: coordinate conversion and the
grid→world mapping. Shared by snake, food, water, and the 3D layers. No THREE
imports, no state — just math so it is trivially correct and reusable.

## Technical spec

`GRID.CELL = 1.0`. Mapping (grid → world flat XZ plane, Y up):
```
worldX(col) = (col - GRID.W/2 + 0.5) * CELL
worldZ(row) = (row - GRID.H/2 + 0.5) * CELL
```
Cell (10,10) → world (0, 0), the center.

Export:
```js
export function cellKey(col, row) { return `${col},${row}`; }
export function parseKey(key)      { const [c, r] = key.split(',').map(Number); return { col: c, row: r }; }
export function toWorld(col, row)  { return { x: (col - GRID.W/2 + 0.5) * GRID.CELL, z: (row - GRID.H/2 + 0.5) * GRID.CELL }; }
export function toGrid(worldX, worldZ) { /* inverse, integer cell */ }
export function inBounds(col, row)  { return col >= 0 && col < GRID.W && row >= 0 && row < GRID.H; }
export const OPPOSITE = { UP: 'DOWN', DOWN: 'UP', LEFT: 'RIGHT', RIGHT: 'LEFT' };
export const DIRS = ['UP', 'DOWN', 'LEFT', 'RIGHT'];
```
(Fix the `CELL` typo — use `GRID.CELL` in `toWorld`.) Also export:
```js
export function stepCell(col, row, dirName) {
  const d = DIRECTION[dirName];
  return { col: col + d.x, row: row + d.z };
}
export function manhattan(a, b) { return Math.abs(a.col - b.col) + Math.abs(a.row - b.row); }
```

## Acceptance criteria
- `toWorld(10,10)` ⇒ `{x:0,z:0}`; the round-trip `toGrid(toWorld(c,r))` returns
  the original cell for in-bounds cells.
- `(OPPOSITE.LEFT === 'RIGHT')`, etc.
- `stepCell` + `inBounds` correctly detect moving out of bounds at each edge.
- No imports beyond `config/constants.js`.
