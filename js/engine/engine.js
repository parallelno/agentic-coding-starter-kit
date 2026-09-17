// SNAKE — Cinematic Edition: game engine.
// Owns the fixed-step simulation clock, wires core + sound + leaderboard, and
// publishes the event bus. Node-runnable with mock graphics (R-ARCH-02) and no
// `three` import — graphics is treated opaquely (R-ARCH-01 layering: the engine
// never reaches into the world layer).

import { createGame } from '../game/core.js';
import { createLeaderboard } from '../providers/leaderboard.js';
import { tierConfig } from '../providers/quality.js';

// A silent, no-op sound backend so the engine runs with no injection.
function noopSound() {
  let muted = false;
  return {
    play() {},
    setMuted(m) {
      muted = !!m;
    },
    isMuted() {
      return muted;
    },
  };
}

function noopGraphics() {
  return { size() {}, render() {} };
}

function perfClock() {
  return {
    now() {
      return typeof performance !== 'undefined' && performance.now
        ? performance.now()
        : Date.now();
    },
  };
}

export class GameEngine {
  constructor({
    game,
    input,
    sound,
    graphics,
    clock,
    quality = 'standard',
    leaderboard,
  } = {}) {
    this.game = game || createGame({ rng: Math.random });
    this.input = input || null;
    this.sound = sound || noopSound();
    this.graphics = graphics || noopGraphics();
    this.clock = clock || perfClock();
    this.quality = quality;
    this.tier = tierConfig(quality);
    this.leaderboard =
      leaderboard || createLeaderboard({ now: this.clock.now.bind(this.clock) });

    this._listeners = new Map();
    this._acc = 0;
    this._lastNow = this.clock.now();

    // Report initial layout to any graphics that sizes on boot.
    this.graphics.size(0, 0);
  }

  on(evt, fn) {
    if (!this._listeners.has(evt)) this._listeners.set(evt, []);
    this._listeners.get(evt).push(fn);
    return () => {
      const arr = this._listeners.get(evt) || [];
      const i = arr.indexOf(fn);
      if (i >= 0) arr.splice(i, 1);
    };
  }

  _emit(evt, payload) {
    const arr = this._listeners.get(evt);
    if (!arr) return;
    for (const fn of arr.slice()) fn(payload);
  }

  stateEvt(snap) {
    const top = this.leaderboard.list().slice(0, 3);
    return {
      ...snap,
      length: snap.snake.length,
      best: top.length ? top[0].score : 0,
      top,
    };
  }

  snapshot() {
    return this.game.state();
  }

  start() {
    const st = this.game.state().state;
    if (st !== 'menu' && st !== 'dead') return;
    this.game.start();
    this._acc = 0;
    this._lastNow = this.clock.now();
    this._emit('state', this.stateEvt(this.game.state()));
  }

  pause() {
    if (this.game.state().state !== 'playing') return;
    this.game.pause();
    this._emit('state', this.stateEvt(this.game.state()));
  }

  resume() {
    if (this.game.state().state !== 'paused') return;
    this.game.resume();
    this.sound.play('resume');
    this._acc = 0; // no dt spike across the pause gap (R-PERF-03)
    this._lastNow = this.clock.now();
    this._emit('state', this.stateEvt(this.game.state()));
  }

  turn(dir) {
    this.game.turn(dir);
  }

  mute() {
    const m = !this.sound.isMuted();
    this.sound.setMuted(m);
    this._emit('mute', { muted: this.sound.isMuted() });
  }

  resize(w, h) {
    this.graphics.size(w, h);
  }

  // Step the simulation. dtMs is real elapsed ms; clamp to <=100 (R-PERF-02).
  update(dtMs) {
    const dt = Math.min(dtMs, 100);
    this._lastNow = this.clock.now();
    this._acc += dt;

    let guard = 0;
    while (this.game.state().state === 'playing' && guard++ < 100000) {
      const snap = this.game.state();
      const interval = this.game.tickIntervalMs(snap);
      if (this._acc < interval) break;
      this._acc -= interval;
      this._stepTick();
    }

    this.graphics.render(this.game.state());
  }

  // Advance one tick, translating core transitions into events.
  _stepTick() {
    const before = this.game.state();
    this.game.tick();
    const after = this.game.state();

    if (after.snake.length > before.snake.length) {
      // Grew -> the head entered the eaten cell this tick.
      const head = after.snake[0];
      this._emit('eat', { c: head.c, r: head.r });
      this._emit('state', this.stateEvt(after));
    }

    if (after.state === 'dead') {
      this._onDeath(after);
    }
  }

  _onDeath(after) {
    // Submit the final score BEFORE emitting state so top/best include it.
    try {
      this.leaderboard.submit(after.score);
    } catch (e) {
      /* leaderboard faults must never crash death (test seam) */
    }
    if (after.won) {
      this._emit('death', { c: null, r: null, won: true });
    } else {
      const dc = after.deathCell;
      this._emit('death', {
        c: dc ? dc.c : null,
        r: dc ? dc.r : null,
        won: false,
      });
    }
    this._emit('state', this.stateEvt(after));
  }
}

export function createEngine(opts) {
  return new GameEngine(opts);
}
