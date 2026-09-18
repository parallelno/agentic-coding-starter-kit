/**
 * Single tuning source for the game.
 * All balance/layout constants live here — modules must not hard-code magic numbers.
 */

export const GRID = {
  N: 21,          // cells per side (odd → centered pond)
  CELL: 1,        // world units per cell
};

export const SPEED = {
  BASE: 8,          // cells / second
  PER_APPLE: 0.25,  // speed-up per apple eaten
  MAX: 14           // speed ceiling
};

export const STEP_MS = 1000 / 8; // fixed logic step (8 Hz → 1 cell per step at speed 8)

export const SNAKE_START = {
  LEN: 3,
  CELL: [8, 8], // grid coords [x, z], 0-indexed
  DIR: { x: 1, z: 0 }
};

export const POND = {
  CENTER: [13, 15], // grid coords — off-center so the snake spawns clear of it
  RADIUS_CELLS: 3.5
};

export const COLORS = {
  FLOOR: 0xb8a888,
  WALL: 0x8a6f52,
  SNAKE_HEAD: 0x2fbf71,
  SNAKE_BODY: 0x47d98a,
  APPLE: 0xe33b30
};