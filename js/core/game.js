import { GRID, SPEED, SNAKE_START, POND, STEP_MS } from '../config.js';
import { EVT } from './events.js';

/** Convert a grid cell [x, z] to world-space position on a 0-centered grid. */
export function cellToWorld(cell) {
  const off = (GRID.N - 1) / 2;
  return { x: (cell[0] - off) * GRID.CELL, z: (cell[1] - off) * GRID.CELL };
}

/**
 * Pure-ish gameplay core: grid snake, apples, score, death.
 * Runs on a fixed step; emits presentation events via the shared bus.
 */
export class Game {
  /** @param {import('./events.js').Events} events */
  constructor(events) {
    this.events = events;
    this.reset();
  }

  reset() {
    const N = GRID.N;
    this.snake = [];
    const [sx, sz] = SNAKE_START.CELL;
    for (let i = 0; i < SNAKE_START.LEN; i++) {
      this.snake.push([sx - i, sz]); // head at index 0, tail behind
    }
    this.dir = { ...SNAKE_START.DIR };
    this._buf = [];               // queued direction changes (max 2)
    this.apples = 0;
    this.speed = SPEED.BASE;
    this.alive = true;
    this.occupied = new Set(this.snake.map(([x, z]) => x + ',' + z));
    this.appleCell = this._spawnApple();
    this.prevSnake = this.snake.map((c) => [...c]); // prev-step snapshot for render interpolation
  }

  get score() { return this.apples * 10; }
  /** Fractional cells moved in the current step (interpolation target). */
  get speedNorm() { return this.speed / SPEED.BASE; }

  /** @param {{x:number,z:number}} dir */
  queueDir(dir) {
    const last = this._buf[this._buf.length - 1] ?? this.dir;
    // Reject 180° reversals and duplicates; queue for next steps.
    if (dir.x === -last.x && dir.z === -last.z) return;
    if (dir.x === last.x && dir.z === last.z) return;
    if (this._buf.length < 2) this._buf.push(dir);
  }

  /** One fixed logic step. */
  step() {
    // Snapshot for render interpolation: visual = lerp(prevSnake, snake, alpha)
    this.prevSnake = this.snake.map((c) => [...c]);

    if (!this.alive) return;
    if (this._buf.length) this.dir = this._buf.shift();

    const head = this.snake[0];
    const next = [head[0] + this.dir.x, head[1] + this.dir.z];
    const N = GRID.N;

    // Wall collision
    if (next[0] < 0 || next[0] >= N || next[1] < 0 || next[1] >= N) {
      this._die('wall'); return;
    }
    // Self collision (tail cell about to vacate is safe unless growing this step)
    const eating = next[0] === this.appleCell[0] && next[1] === this.appleCell[1];
    if (!eating && this.occupied.has(next[0] + ',' + next[1])) {
      this._die('self'); return;
    }
    // Pond (water) hazard — actual gameplay hazard, not decoration
    if (this._inPond(next)) { this._die('pond'); return; }

    this.snake.unshift(next);
    this.occupied.add(next[0] + ',' + next[1]);

    if (eating) {
      this.apples++;
      this.speed = Math.min(SPEED.MAX, SPEED.BASE + SPEED.PER_APPLE * this.apples);
      this.events.emit(EVT.COLLECT, { score: this.score, apples: this.apples });
      this.appleCell = this._spawnApple();
    } else {
      const tail = this.snake.pop();
      this.occupied.delete(tail[0] + ',' + tail[1]);
    }
  }

  _die(cause) {
    this.alive = false;
    this.events.emit(EVT.DIE, { cause, score: this.score });
  }

  _inPond(cell) {
    const [px, pz] = POND.CENTER;
    const dx = cell[0] - px, dz = cell[1] - pz;
    return Math.hypot(dx, dz) <= POND.RADIUS_CELLS;
  }

  _spawnApple() {
    // Random free cell, outside the pond, up to N tries (grid is dense enough
    // that failure is practically impossible; fall back to a spiral).
    const N = GRID.N;
    for (let i = 0; i < 64; i++) {
      const cell = [
        (Math.random() * N) | 0,
        (Math.random() * N) | 0
      ];
      const key = cell[0] + ',' + cell[1];
      if (this.occupied.has(key)) continue;
      if (this._inPond(cell)) continue;
      return cell;
    }
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      const key = x + ',' + z;
      if (!this.occupied.has(key) && !this._inPond([x, z])) return [x, z];
    }
    return [0, 0];
  }
}