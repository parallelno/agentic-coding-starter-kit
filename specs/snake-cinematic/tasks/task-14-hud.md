# Task 14 — HUD & Menus (DOM overlay)

- **Wave:** 3
- **Files to create:** `js/ui/hud.js`
- **Depends on:** `js/config/quality.js` (W1, QUALITY_TIERS),
  `js/util/eventBus.js` (W1, `bus`), `js/ui/leaderboard.js` (W2,
  `createLeaderboard`). Pure DOM, no Three.js.

## Description

The only place that touches the DOM overlay: score, effective speed, a quality
tier toggle (low/medium/high), pause indicator, and the start / pause / game-over
screens (with the local leaderboard shown on game-over). It subscribes to the
bus events `score`, `speed`, `state` (and `sfx` via wiring for the unlock) and
exposes methods the integration calls for user actions: `start()`, `pauseToggle()`,
`setQuality(name)`, `onQualityChange(cb)`.

Expected DOM ids (created by `index.html` / integration; see task-18):
`#score`, `#speed`, `#quality-low/medium/high` (buttons) or a `#quality` select,
`#overlay`, `#overlay-title`, `#overlay-msg`, `#overlay-board` (leaderboard list),
`#overlay-action` (the prompt/button: "Press to start" / "Press to resume").

## Technical spec

```js
import { QUALITY_TIERS } from '../config/quality.js';
import { bus } from '../util/eventBus.js';
import { createLeaderboard } from './leaderboard.js';

export class Hud {
  constructor() { this.lb = createLeaderboard(); this._onQuality = null;
                  this._bindBus(); this._bindDom(); }
  _bindBus() {
    this._off = [
      bus.on('score', p => this.#set('score', Math.round(p.value))),
      bus.on('speed', p => this.#set('speed', p.value.toFixed(1) + '×')),
      bus.on('state', p => this.#renderState(p.value)),  // 'READY'|'RUNNING'|'GAME_OVER'|'PAUSED'
    ];
  }
  _bindDom() {
    // quality buttons/select → this.onQualityChange(tier) → parent wiring
    // overlay action element → emits a 'start'/'pause' intent via a callback
    //   set by the integration (this.hud.setActionsHandler(fn))
  }
  setActionsHandler(fn) { this._actions = fn; } // called with {type:'start'|'pause'}
  setQuality(name) { this.currentTier = name; /* toggle enabled button */ }
  onQualityChange(cb) { this._onQuality = cb; }  // parent wires to Renderer.setTier
  #set(sel, html) { const el = document.querySelector(sel); if (el) el.textContent = html; }
  #renderState(state) {
    // READY: show overlay title "SNAKE" + "Press to start", hide board
    // RUNNING: hide overlay
    // PAUSED: show "Paused — Press to resume", hide board
    // GAME_OVER: show "Game Over", score, and the leaderboard (async load)
  }
  async #showBoard() { const top = await this.lb.top(10);
    /* render rows into #overlay-board */ }
}
```

- HUD reads are cheap text updates only.
- On `GAME_OVER`, the integration calls `hud.saveScore(score, name)` which
  `await lb.add(score, name)` then re-renders the board. Provide that method.
- The quality control must call both `Renderer.setTier` (parent) and update its
  own selected state; expose via `onQualityChange`.
- Keep it resilient to missing DOM nodes (guard `querySelector`).

## Acceptance criteria
- After `bus.emit('score', {value:40})`, `#score` shows `40`.
- `#renderState('GAME_OVER')` shows the overlay with title and a leaderboard
  populated from `localStorage`.
- Quality buttons reflect the active tier and invoking one fires the
  `onQualityChange` callback with the correct tier name.
- No errors when the overlay/score nodes are not yet in the DOM.
