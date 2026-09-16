export const GRID = { W: 21, H: 21, CELL: 1.0 };

export const CENTER = { col: 10, row: 10 };

export const DIRECTION = {
  UP:    { x: 0, z: -1 },
  DOWN:  { x: 0, z: 1 },
  LEFT:  { x: -1, z: 0 },
  RIGHT: { x: 1, z: 0 },
};

export const SPEED = { baseCellsPerSec: 8, perFood: 0.35, maxCellsPerSec: 15, waterFactor: 0.5 };

export const SCORE_PER_FOOD = 10;
export const SNAKE_START_LENGTH = 3;
export const WATER_WOBBLE = 0.35;
export const WATER_OFFSET_Y = 0.02;
