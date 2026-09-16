# Task 17 — Game State Machine (orchestration)

- **Wave:** 5
- **Files to create:** `js/game/state.js`
- **Depends on:** `js/util/eventBus.js` (W1), `js/game/snake.js` (W3),
  `js/game/input.js` (W3), `js/game/food.js` (W4), `js/renderer/water.js` (W3),
  `js/config/constants.js` (W1). Pure JS + Three-agnostic (it drives the bus;
  it does NOT own the renderers — the integration task wires them).

## Description

The brain: the `READY → RUNNING → PAUSED / GAME_OVER` state machine and the
fixed step loop. It composes snake + input + food + water, advances the snake
on a fixed time step (speed-based cadence, slowed by water), applies buffered
turns, handles eat/death, computes score and effective speed, and emits all bus
events (`score`, `speed`, `state`, `sfx`, `shake`). The integration task
(task-18) calls `state.tick(dt, time)` each frame and reads `state.headWorld`
to drive the camera; it renders the snake from `snake.body`.

## Technical spec

```js
import { bus } from '../util/eventBus.js';
import { Snake } from './snake.js';
import { Food } from './food.js';
import { SPEED, SCORE_PER_FOOD } from '../config/constants.js';
import { toWorld } from './grid.js';

export const STATE = { READY:'READY', RUNNING:'RUNNING', PAUSED:'PAUSED', GAME_OVER:'GAME_OVER' };

export class GameState {
  constructor({ input, water, audio }) {
    this.input = input; this.water = water; this.audio = audio;
    this.snake = new Snake();
    this.food  = new Food(water);
    this.score = 0;
    this.state = STATE.READY;
    this.acc   = 0;
    this.speed = SPEED.baseCellsPerSec;
    this.headWorld = toWorld(this.snake.head.col, this.snake.head.row);
    this._prevWater = false;
    input.onInput((intent) => this._onIntent(intent));
  }
  _onIntent(it) {
    if (it.type === 'start') { if (this.state === STATE.READY || this.state === STATE.GAME_OVER) this.start(); }
    else if (it.type === 'pause') { this.togglePause(); }
    else if (it.type === 'direction') { this._queueDir(it.dir); }
  }
  _queueDir(dir) {
    if (this.state !== STATE.RUNNING) return;
    // validate vs last applied dir (no 180°); push into input buffer
    const last = this.snake.dir;
    if (dir === last) return;
    if ({UP:'DOWN',DOWN:'UP',LEFT:'RIGHT',RIGHT:'LEFT'}[last] === dir) return;
    this.input._queued.push(dir); // internal buffer; capped by input
  }
  start() {
    this.snake.reset(); this.score = 0; this.speed = SPEED.baseCellsPerSec;
    this.acc = 0; this._prevWater = false;
    this.food.spawn(this.snake.body);
    this._setState(STATE.RUNNING);
    this._emitScore(); this._emitSpeed();
  }
  togglePause() {
    if (this.state === STATE.RUNNING) this._setState(STATE.PAUSED);
    else if (this.state === STATE.PAUSED) this._setState(STATE.RUNNING);
    this._playSfx('ui');
  }
  // Advance by dt seconds (call once per frame from the RAF loop).
  tick(dt, t) {
    if (this.state !== STATE.RUNNING) { this._publishHead(); return; }
    const head = this.snake.head;
    const inWater = this.water.isWater(head.col, head.row);
    // one-time entry cue (splash + tiny shake + wobble hook)
    if (inWater && !this._prevWater) { bus.emit('sfx', {name:'splash'}); bus.emit('shake', {power:0.15}); }
    this._prevWater = inWater;

    const eff = Math.min(SPEED.maxCellsPerSec, SPEED.baseCellsPerSec + (this._eaten()) * SPEED.perFood) * (inWater ? SPEED.waterFactor : 1);
    this.speed = eff;
    this.acc += dt;
    const step = 1 / eff;
    let guard = 0;
    while (this.acc >= step && this.state === STATE.RUNNING && guard++ < 4) {
      this.acc -= step;
      this._step();
    }
    if (guard >= 4) this.acc = 0; // spiral-of-death safety
    this._emitSpeed();
    this._publishHead();
  }
  _eaten() { return Math.round(this.score / SCORE_PER_FOOD); }
  _step() {
    // apply a buffered turn if valid
    const dir = this.input.consumeTurn();
    if (dir) this.snake.setDir(dir);
    const prev = this.snake.head;
    const res = this.snake.step();
    this._publishHead();
    if (res.died) { this._die(res.reason); return; }
    if (this.snake.head.col === prev.col && this.snake.head.row === prev.row) return;
    if (this.food.isEaten(this.snake.head.col, this.snake.head.row)) {
      this._eat();
    }
  }
  _eat() {
    this.snake.eat(1);
    this.score += SCORE_PER_FOOD;
    this._emitScore();
    bus.emit('sfx', {name:'eat'});
    bus.emit('shake', {power:0.3});
    this.food.spawn(this.snake.body);
  }
  _die(reason) {
    this._setState(STATE.GAME_OVER);
    bus.emit('sfx', {name:'death'});
    bus.emit('shake', {power:1.0});
  }
  _setState(s) { this.state = s; bus.emit('state', {value: s}); }
  _emitScore() { bus.emit('score', {value: this.score}); }
  _emitSpeed() { bus.emit('speed', {value: this.speed / SPEED.baseCellsPerSec}); } // "×N"
  _playSfx(n) { bus.emit('sfx', {name: n}); if (this.audio) this.audio.play(n); }
  _publishHead() { const h = this.snake.head; const w = toWorld(h.col, h.row);
                   this.headWorld.x = w.x; this.headWorld.z = w.z; } // avoid realloc
}
```

Key rules it enforces (from requirements.md §Game rules):
- Discrete stepping with **speed-based** cadence; `step = 1/eff` where `eff`
  includes the `waterFactor` slow while the head cell is water.
- Speed grows per food (`base + eaten*perFood`), capped by `maxCellsPerSec`.
- Buffered turns (from input) applied one per step, never a 180° reversal.
- Death on wall or self-collision; **water is not lethal** (it slows + cues).
- Emit `speed` as a ratio for the HUD "×N" display (default 1.0×).
- Guard the while-loop (max 4 steps/frame) to survive big `dt` hitches.

## Acceptance criteria
- From `READY`, a `start` intent → `RUNNING`, emits `state`, `score` (0),
  `speed` (~1×). Tick advances the snake smoothly; `headWorld` tracks the head.
- Eating 3 food raises score to 30 and effective speed to
  `1 + 3*0.35 = 2.05×` of base (before water).
- Stepping the head into a water cell slows the cadence (~50%) and fires a
  single `splash` SFX + shake (only on entry, not while dwelling).
- Wall or self collision → `GAME_OVER`, `death` SFX, `shake` power 1.0.
- `pause` toggles `PAUSED`/`RUNNING`; `tick` is inert while paused.
- Rapid turns in one frame are applied across successive steps (buffered),
  never dropping a valid corner.
