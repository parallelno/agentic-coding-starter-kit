// js/engine/engine.js — composition + state machine (T05).
//
// Layering (R-ARCH-01): engine is a pure composition layer. It may import
// js/game/*, js/input/*, js/providers/*; it never imports js/world/* or
// js/ui/*, and it imports no `three` itself (R-TEST-01, R-ARCH-06) — the
// `graphics` dependency is treated opaquely per R-ARCH-02. Node-importable.
//
// The engine owns the fixed-step simulation clock (R-PERF-02): each `update`
// adds the caller's frame delta (clamped to <=100 ms) to an accumulator, and
// while `state === 'playing'` the accumulator buys whole ticks at
// `tickIntervalMs(current snapshot)` (pond cells stretch the interval per
// R-CORE-02). Rendering runs once per `update`, never per tick. The simulation
// never steps while `menu | paused | dead` (R-PERF-02, R-CORE-05).
//
// Event bus (R-ARCH-04, authoritative payloads):
//   `state` -> { ...core snapshot (R-ARCH-05), length, best, top }
//              on start, pause, resume, entering dead (death or win), and after
//              every eat. `top = leaderboard.list().slice(0,3)`,
//              `best = top[0].score ?? 0`.
//   `eat`   -> { c, r } of the eaten cell
//   `death` -> { c, r, won } (win: c === null, r === null, won === true)
//   `mute`  -> { muted }
// On entering `dead` (loss or win) the run's score is submitted through the
// leaderboard **before** the `state` event, so `top` / `best` include the
// final run. The core's `snap.won` wins over `snap.alive` for any decision,
// and the engine never mutates core snapshots (it emits copies).

import { tickIntervalMs } from '../game/core.js';

const MAX_FRAME_MS = 100; // R-PERF-02 clamped frame delta.

function defaultClock() {
  const perf = globalThis.performance;
  if (perf && typeof perf.now === 'function') return { now: () => perf.now() };
  return { now: () => Date.now() };
}

function emptyGraphics() {
  return { size() {}, render() {} };
}

function emptySound() {
  return { play() {}, setMuted() {}, isMuted: () => false };
}

/**
 * @param {object} deps
 * @param {object} deps.game Core game (T02 `createGame()` result): `state()`,
 *   `start()`, `pause()`, `resume()`, `turn(dir)`, `tick()`.
 * @param {object} [deps.input] Input adapter exposing
 *   `install({ emit, document })` (T03 `installInput` shape); the engine owns
 *   per-state filtering (R-INPUT-01/03).
 * @param {object} [deps.sound] Sound backend (R-UI-01): `play(name)`,
 *   `setMuted(bool)`, `isMuted()`.
 * @param {object} [deps.graphics] Opaque graphics (R-ARCH-02): `size(w, h)`,
 *   `render(snapshot)`.
 * @param {object} [deps.clock] `{ now(): ms }` fake clock for tests.
 * @param {string} [deps.quality] Quality tier name (R-PERF-01).
 * @param {object} [deps.leaderboard] Leaderboard provider (R-ARCH-03):
 *   `list()`, `submit(score)`, `best()`. Falls back to the game's own
 *   `leaderboard` field when not injected.
 * @param {{ width?: number, height?: number }} [deps.canvas] Initial size
 *   pushed to `graphics.size` at construction.
 */
export class GameEngine {
  constructor({ game, input, sound = emptySound(), graphics = emptyGraphics(), clock = defaultClock(), quality = 'standard', leaderboard, canvas = { width: 960, height: 540 } } = {}) {
    if (!game || typeof game.state !== 'function') {
      throw new Error('GameEngine: `game` with a `state()` method is required');
    }
    this.game = game;
    this.sound = sound;
    this.graphics = graphics;
    this.clock = clock;
    this.quality = quality;
    this.canvas = { width: canvas.width, height: canvas.height };
    this.leaderboard = leaderboard !== undefined ? leaderboard : game.leaderboard || null;

    this._listeners = new Map(); // evt -> Set<fn>
    this._state = game.state().state;
    this._muted = false;
    this._accumulator = 0; // ms of unspent simulation time
    this._lastMs = this.clock.now();

    this.graphics.size(this.canvas.width, this.canvas.height);
    this._installInput(input);
  }

  // --- R-ARCH-05 -----------------------------------------------------------------

  /** Shared snapshot (R-ARCH-05): the single source the visuals/HUD read. */
  gameState() {
    return this.game.state();
  }

  // --- event bus (R-ARCH-04) -------------------------------------------------------

  /** Subscribe; returns the unsubscribe function. */
  on(evt, fn) {
    let set = this._listeners.get(evt);
    if (!set) {
      set = new Set();
      this._listeners.set(evt, set);
    }
    set.add(fn);
    return () => {
      set.delete(fn);
      if (set.size === 0) this._listeners.delete(evt);
    };
  }

  _emit(evt, payload) {
    const set = this._listeners.get(evt);
    if (!set || set.size === 0) return;
    for (const fn of Array.from(set)) fn(payload);
  }

  _emitState(snap) {
    const lb = this.leaderboard;
    const top = lb && typeof lb.list === 'function' ? lb.list().slice(0, 3) : [];
    const best = top.length > 0 ? top[0].score ?? 0 : 0;
    // Never mutate the core snapshot: emit a fresh copy (R-ARCH-04/05).
    this._emit('state', { ...snap, length: snap.snake.length, best, top });
  }

  _submitScore(score) {
    const lb = this.leaderboard;
    if (lb && typeof lb.submit === 'function') lb.submit(score);
  }

  // --- input wiring -------------------------------------------------------------------

  _installInput(input) {
    if (!input || typeof input.install !== 'function') return;
    try {
      const off = input.install({
        emit: (event) => this._handleInput(event),
        // `document` is resolved at install time (R-INPUT-03); headless (Node)
        // gives `undefined`, which installs nothing.
        document: (typeof globalThis.document !== 'undefined' ? globalThis.document : null),
      });
      this._inputOff = off || null;
    } catch {
      this._inputOff = null; // non-DOM / no-doc environment: input is a no-op
    }
  }

  _handleInput(event) {
    if (!event || !event.type) return;
    switch (event.type) {
      case 'turn':
        this.turn(event.dir);
        break;
      case 'start':
        if (this._state === 'menu' || this._state === 'dead') this.start();
        break;
      case 'pause':
        if (this._state === 'playing') this.pause();
        else if (this._state === 'paused') this.resume();
        break;
      case 'mute':
        this.mute();
        break;
    }
  }

  // --- state machine ---------------------------------------------------------------------

  /** menu | dead -> playing: fresh layout, accumulator + clock baseline reset. */
  start() {
    if (this._state !== 'menu' && this._state !== 'dead') return;
    this.game.start();
    this._state = 'playing';
    this._accumulator = 0;
    this._lastMs = this.clock.now(); // R-PERF-03: no dt spike after idle
    this._emitState(this.game.state());
  }

  pause() {
    if (this._state !== 'playing') return;
    this.game.pause();
    this._state = 'paused';
    this._emitState(this.game.state());
  }

  /** paused -> playing; plays the resume blip and resets the clock baseline. */
  resume() {
    if (this._state !== 'paused') return;
    this.game.resume();
    this._state = 'playing';
    this.sound.play('resume'); // R-UI-01; the backend suppresses output while muted
    this._accumulator = 0; // R-PERF-03
    this._lastMs = this.clock.now();
    this._emitState(this.game.state());
  }

  /**
   * State-agnostic forwarding: input emits turns regardless of state
   * (R-INPUT-01) and the core ignores turns that can't apply; the engine
   * re-syncs `_state` from the authoritative snapshot afterwards.
   */
  turn(dir) {
    if (!dir) return;
    this.game.turn(dir);
    this._state = this.game.state().state;
  }

  mute() {
    this._muted = !this._muted;
    this.sound.setMuted(this._muted);
    this._emit('mute', { muted: this.sound.isMuted() });
  }

  /** Re-size the opaque graphics backend (R-ARCH-02). */
  resize(w, h) {
    this.canvas.width = Number(w);
    this.canvas.height = Number(h);
    this.graphics.size(this.canvas.width, this.canvas.height);
  }

  // --- fixed-step update ----------------------------------------------------------------------

  /**
   * Once per frame (R-PERF-02). Clamps the frame delta to <=100 ms, adds it to
   * the accumulator, and while `playing` spends the accumulator on whole ticks
   * at `tickIntervalMs(snap)`. `eat` fires when a tick crosses a score
   * boundary (the head entered the food cell); `death` + `state` fire when a
   * tick enters `dead` (the submitted score is recorded before the `state`
   * event). Rendering runs exactly once per update with the latest snapshot.
   */
  update(dtMs) {
    const clamped = Math.max(0, Math.min(Number(dtMs) || 0, MAX_FRAME_MS));
    this._accumulator += clamped;

    if (this._state === 'playing') {
      let snap = this.game.state();
      while (this._state === 'playing' && this._accumulator >= tickIntervalMs(snap)) {
        this._accumulator -= tickIntervalMs(snap);

        const prevScore = snap.score;
        const prevState = snap.state;
        snap = this.game.tick();

        const ate = snap.state === 'playing' && snap.score > prevScore;
        if (ate) {
          // The head entered the food cell this tick; that cell is `eat`.
          const head = snap.snake[0];
          const cell = { c: head.c, r: head.r };
          this.sound.play('eat');
          this._emit('eat', cell);
          // `state` fires after every eat (R-ARCH-04) — exactly one per tick
          // that ate; a non-ate tick never re-emits `state`.
          this._emitState(snap);
        }

        if (snap.state === 'dead' && prevState === 'playing') {
          // Enter dead (loss or win): `snap.won` wins over `snap.alive`
          // (task contract) — submit the run BEFORE the `state` event so the
          // emitted `top` / `best` already include this run (R-ARCH-04).
          this._submitScore(snap.score);
          const death = snap.won
            ? { c: null, r: null, won: true }
            : { c: snap.deathCell ? snap.deathCell.c : null, r: snap.deathCell ? snap.deathCell.r : null, won: false };
          this._emit('death', death);
          this._emitState(snap);
          this._state = 'dead';
        }
      }
      this._state = this.game.state().state; // authoritative re-sync (defensive)
    }

    this._lastMs = this.clock.now();
    // Rendering runs every frame with the latest snapshot, regardless of state
    // (R-PERF-02: "render the static scene so pause looks alive").
    this.graphics.render(this.game.state());
  }
}

/**
 * R-ARCH-03 composition-root factory: `createEngine({ game, input, sound,
 * graphics, clock, quality, leaderboard, canvas }) -> GameEngine`. Defaults:
 * no injected input (headless), empty sound/graphics, performance-based clock,
 * `'standard'` quality, and the game's own leaderboard.
 */
export function createEngine(deps = {}) {
  return new GameEngine(deps);
}
