import { GRID, DIRECTION } from '../config/constants.js';

export function cellKey(col, row) { return `${col},${row}`; }
export function parseKey(key) { const [c, r] = key.split(',').map(Number); return { col: c, row: r }; }
export function toWorld(col, row) { return { x: (col - GRID.W/2 + 0.5) * GRID.CELL, z: (row - GRID.H/2 + 0.5) * GRID.CELL }; }
export function toGrid(worldX, worldZ) { return { col: Math.floor(worldX + GRID.W/2), row: Math.floor(worldZ + GRID.H/2) }; }
export function inBounds(col, row) { return col >= 0 && col < GRID.W && row >= 0 && row < GRID.H; }
export const OPPOSITE = { UP: 'DOWN', DOWN: 'UP', LEFT: 'RIGHT', RIGHT: 'LEFT' };
export const DIRS = ['UP', 'DOWN', 'LEFT', 'RIGHT'];
export function stepCell(col, row, dirName) { const d = DIRECTION[dirName]; return { col: col + d.x, row: row + d.z }; }
export function manhattan(a, b) { return Math.abs(a.col - b.col) + Math.abs(a.row - b.row); }
