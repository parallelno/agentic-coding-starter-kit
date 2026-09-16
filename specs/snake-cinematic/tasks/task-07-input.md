# Task 07 — Input

- **Wave:** 3
- **Files to create:** `js/game/input.js`
- **Depends on:** `js/game/grid.js` (OPPOSITE for reversal check, W2),
  `js/config/constants.js` (DIRECTION, W1).

## Description

Collects player intent from keyboard (arrows/WASD, Space, Enter) and touch
(swipe on the canvas), and emits normalized *intent* events via a callback.
It does NOT change snake state — it only reports what the player did, so it can
be tested in isolation and re-pointed by the state machine.

## Technical spec

Emit intents of the shape (callback receives the intent object):
```js
{ type: 'direction', dir: 'UP' }   // one of UP/DOWN/LEFT/RIGHT
{ type: 'start' }                  // press to begin / restart
{ type: 'pause' }                  // toggle pause
```

```js
export class Input {
  constructor() {
    this._lastDir = null;   // last accepted direction (for 180° rejection)
    this._queued = [];      // buffered directions for smooth multi-turn frames
  }
  onInput(cb) { this._cb = cb; return this; }   // chainable
  setLastDir(dir) { this._lastDir = dir; }
  start() { /* bind window keydown + canvas pointer/touch */ }
  stop()  { /* unbind */ }
}
```

Keyboard mapping: ArrowUp/W→UP, ArrowDown/S→DOWN, ArrowLeft/A→LEFT,
ArrowRight/D→RIGHT, Space→pause, Enter→start.
- On a direction key, if the candidate equals current last dir, ignore.
- If it equals `OPPOSITE[last]`, ignore (no 180° reversal).
- Otherwise queue it (max keep last 2 in `this._queued` to buffer fast corners)
  and emit `{type:'direction', dir}`.
- Touch/pointer: record first `pointerdown`, on `pointerup` compute swipe delta;
  if |dx|>|dy| → LEFT/RIGHT else UP/DOWN (only if |move|>24px). Emit direction
  with the same reversal rules. `touch-action: none` on the canvas (set by
  index.html / CSS).
- The state machine pulls buffered turns with `consumeTurn()` (shifts
  `this._queued`, returns a dir or null). The state *pushes* buffered turns via
  `bufferTurn(dir)` (appends to `this._queued`, keeping at most the last 2).
  The state owns direction validity (no 180°); `input` merely buffers and
  delivers. `setLastDir` may still be kept for `input`'s own keydown handler.

Keep a single `window` listener each; guard `start()` against double-binding.

## Acceptance criteria
- Pressing two opposite directions in a row never emits the reversal.
- Rapid cornering (turn+turn in one frame) is buffered and both are consumable
  via `consumeTurn()`.
- A rightward swipe emits `{type:'direction',dir:'RIGHT'}`.
- `stop()` removes all listeners (no leaks).
