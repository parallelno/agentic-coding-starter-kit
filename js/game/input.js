import { OPPOSITE } from '../game/grid.js';

// Keyboard → direction mapping (arrows + WASD). Space/Enter handled separately.
const KEY_DIR = {
  ArrowUp: 'UP',
  ArrowDown: 'DOWN',
  ArrowLeft: 'LEFT',
  ArrowRight: 'RIGHT',
  w: 'UP',
  s: 'DOWN',
  a: 'LEFT',
  d: 'RIGHT',
};

// Legacy keyCode → direction (fallback when e.key is a number, not a string).
const KEYCODE_DIR = { 38: 'UP', 40: 'DOWN', 37: 'LEFT', 39: 'RIGHT', 87: 'UP', 83: 'DOWN', 65: 'LEFT', 68: 'RIGHT' };

// Minimum swipe distance (px) before a touch/pointer is considered a direction.
const SWIPE_MIN = 24;

// Buffer cap: keep at most the last N queued turns (for fast cornering).
const QUEUE_MAX = 2;

export class Input {
  constructor() {
    this._lastDir = null;   // last accepted direction (for 180° rejection)
    this._queued = [];      // buffered directions (keep at most last 2)
    this._cb = null;
    this._bound = false;
    this._handlers = {};    // store bound fns so stop() can unbind the same ones
    // pointer state for swipe ({x,y,id} of the active pointerdown, or null)
    this._ptr = null;
  }

  // Register the intent callback. Chainable.
  onInput(cb) {
    this._cb = cb;
    return this;
  }

  // Externally set the current/last accepted direction (state machine keeps us in sync).
  setLastDir(dir) {
    this._lastDir = dir;
  }

  // Push a buffered turn. Kept to at most the last 2 so a fast double-corner works.
  bufferTurn(dir) {
    this._queued.push(dir);
    if (this._queued.length > QUEUE_MAX) {
      this._queued.shift(); // drop the oldest, keep the newest 2
    }
  }

  // Pull the next buffered turn (a dir string, or null when empty).
  consumeTurn() {
    return this._queued.shift() || null;
  }

  start() {
    // Idempotent: bind exactly once.
    if (this._bound) return this;
    this._bound = true;

    const w = (typeof window !== 'undefined') ? window : globalThis;

    this._handlers.keydown = (e) => this._onKeydown(e);
    this._handlers.pointerdown = (e) => this._onPointerDown(e);
    this._handlers.pointerup = (e) => this._onPointerUp(e);

    w.addEventListener('keydown', this._handlers.keydown);
    w.addEventListener('pointerdown', this._handlers.pointerdown);
    w.addEventListener('pointerup', this._handlers.pointerup);

    // Fallback for browsers only exposing legacy touch events.
    if (typeof w.addEventListener === 'function' && w.ontouchstart) {
      this._handlers.touchstart = (e) => this._onTouchStart(e);
      this._handlers.touchend = (e) => this._onTouchEnd(e);
      w.addEventListener('touchstart', this._handlers.touchstart, { passive: true });
      w.addEventListener('touchend', this._handlers.touchend, { passive: true });
    }
    return this;
  }

  // Remove every listener we added and reset transient state (idempotent, no leaks).
  stop() {
    if (!this._bound) return this;
    const w = (typeof window !== 'undefined') ? window : globalThis;

    for (const name of Object.keys(this._handlers)) {
      const fn = this._handlers[name];
      if (typeof w.removeEventListener === 'function') {
        w.removeEventListener(name, fn);
      }
    }
    this._handlers = {};
    this._bound = false;
    this._queued = [];
    this._lastDir = null;
    this._ptr = null;
    return this;
  }

  // --- internal handlers ---

  _emit(intent) {
    if (typeof this._cb === 'function') this._cb(intent);
  }

  // Shared acceptance rule: reject same-dir and 180° reversals, then buffer + emit.
  _applyDir(dir) {
    if (dir === this._lastDir) return;                              // same dir: no-op
    if (this._lastDir != null && dir === OPPOSITE[this._lastDir]) return; // no 180° reversal
    this._lastDir = dir;
    this.bufferTurn(dir);
    this._emit({ type: 'direction', dir });
  }

  _onKeydown(e) {
    let dir = null;
    let mode = null;

    if (e && typeof e.key === 'string') {
      const k = e.key;
      if (k === ' ' || k === 'Spacebar') mode = 'pause';
      else if (k === 'Enter') mode = 'start';
      else dir = KEY_DIR[k] || KEY_DIR[k.toLowerCase()];
    } else if (e && e.key != null && typeof e.key === 'number') {
      // legacy keyCode fallback
      if (e.key === 32) mode = 'pause';
      else if (e.key === 13) mode = 'start';
      else dir = KEYCODE_DIR[e.key];
    }

    if (mode === 'pause') {
      this._emit({ type: 'pause' });
      return;
    }
    if (mode === 'start') {
      this._emit({ type: 'start' });
      return;
    }
    if (dir) {
      if (e && typeof e.preventDefault === 'function') e.preventDefault();
      this._applyDir(dir);
    }
  }

  _onPointerDown(e) {
    // First touch / pointer only; ignore any additional pointers.
    if (this._ptr != null) return;
    if (!e || (e.clientX == null && e.clientY == null)) return;
    this._ptr = { x: e.clientX, y: e.clientY, id: e.pointerId != null ? e.pointerId : null };
  }

  _onPointerUp(e) {
    if (this._ptr == null || !e) return;
    const s = this._ptr;
    this._ptr = null;
    // If the pointer is tracked by id and the up event doesn't match, ignore it.
    if (s.id != null && e.pointerId != null && e.pointerId !== s.id) return;
    this._swipe(s.x, s.y, e.clientX, e.clientY);
  }

  _swipe(sx, sy, ex, ey) {
    if (ex == null || ey == null) return;
    const dx = ex - sx;
    const dy = ey - sy;
    if (Math.hypot(dx, dy) < SWIPE_MIN) return;
    const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'RIGHT' : 'LEFT') : (dy > 0 ? 'DOWN' : 'UP');
    this._applyDir(dir);
  }

  _onTouchStart(e) {
    if (this._ptr != null) return;
    const t = e && e.touches && e.touches[0];
    if (!t) return;
    this._ptr = { x: t.clientX, y: t.clientY, id: t.identifier, touch: true };
  }

  _onTouchEnd(e) {
    if (this._ptr == null) return;
    const s = this._ptr;
    this._ptr = null;
    const ch = e && e.changedTouches && e.changedTouches[0];
    if (!ch) return;
    this._swipe(s.x, s.y, ch.clientX, ch.clientY);
  }
}

export default Input;
