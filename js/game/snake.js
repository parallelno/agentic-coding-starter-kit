import { stepCell, inBounds } from '../game/grid.js';
import { CENTER, SNAKE_START_LENGTH } from '../config/constants.js';

export class Snake {
  constructor() { this.reset(); }
  reset() {
    this.body = [];              // head first; array of {col,row}
    this.dir  = 'RIGHT';
    this.grow = 0;
    for (let i = 0; i < SNAKE_START_LENGTH; i++)
      this.body.push({ col: CENTER.col - i, row: CENTER.row });
    this.bodyKey = new Set(this.body.map(c => `${c.col},${c.row}`));
  }
  get head()  { return this.body[0]; }
  get length(){ return this.body.length; }
  setDir(dir) { this.dir = dir; }
  step() {
    const h = this.head;
    const next = stepCell(h.col, h.row, this.dir);
    const wall = !inBounds(next.col, next.row);
    if (!wall) {
      const willGrow = this.grow > 0;
      const movingIntoTail =
        !willGrow && this.body.length > 1 &&
        this.body[this.body.length - 1].col === next.col &&
        this.body[this.body.length - 1].row === next.row;
      if (this.bodyKey.has(`${next.col},${next.row}`) && !movingIntoTail)
        return { died: true, reason: 'self' };
    }
    this.body.unshift(next);
    const tail = this.body[this.body.length - 1];
    this.bodyKey.delete(`${tail.col},${tail.row}`);
    this.bodyKey.add(`${next.col},${next.row}`);
    if (this.grow > 0) { this.grow--; this.bodyKey.add(`${this.body[this.body.length - 1].col},${this.body[this.body.length - 1].row}`); }
    else this.body.pop();
    return { died: wall, reason: wall ? 'wall' : null };
  }
  eat(amount = 1) { this.grow += amount; }
}
