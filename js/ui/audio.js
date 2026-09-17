// js/ui/audio.js — fully synthesized WebAudio SFX (Task 11; R-UI-01).
// No world/engine/three imports (R-ARCH-01). Safe to import under Node with no
// AudioContext: the context is only touched inside unlock()/play().
//
// Loudness model (R-UI-01): a preallocated master gain node at 0.25; each
// sound uses a 0.25 -> 0 gain envelope connected to that master. The `gain`
// field in the frozen spec is part of the documented freeze (1 for all).

const MASTER_GAIN = 0.25;

const SFX = {
  eat: Object.freeze({ type: 'square', f0: 660, f1: 880, ms: 80, gain: 1 }),
  death: Object.freeze({ type: 'sawtooth', f0: 440, f1: 110, ms: 400, gain: 1 }),
  resume: Object.freeze({ type: 'sine', f0: 520, f1: 520, ms: 60, gain: 1 }),
};

/**
 * Pure: the exact frozen SFX spec for a documented name, or `null` for an
 * undocumented name. Documented names: eat / death / resume (R-UI-01).
 * Returns a fresh frozen copy each call (internal table is not exposed).
 *
 * @param {string} name
 * @returns {{type: string, f0: number, f1: number, ms: number, gain: number} | null}
 */
export function sfxSpec(name) {
  const spec = SFX[name];
  return spec ? Object.freeze({ ...spec }) : null;
}

export class SoundBackend {
  /**
   * @param {object} [opts]
   * @param {object|Function} [opts.audioCtx] injected mock AudioContext object
   *   (with createOscillator/createGainNode spies) or an AudioContext
   *   constructor; when omitted, defaults to globalThis.AudioContext (guarded
   *   so importing under Node never throws).
   * @param {number} [opts.masterGain=0.25] master gain node value.
   */
  constructor({ audioCtx, masterGain = MASTER_GAIN } = {}) {
    this._audioCtx = audioCtx ?? null;
    this._ctx = null; // the unlocked AudioContext (mock or real)
    this._master = null; // preallocated master gain node
    this._masterGain = masterGain;
    this._muted = false;
  }

  /**
   * Idempotent. Lazily creates the AudioContext (real, or the injected mock)
   * and preallocates the master gain node. Call from main.js on the first
   * user gesture (R-UI-01). Returns the ctx (or null when unavailable).
   */
  unlock() {
    if (this._ctx) return this._ctx;
    const a = this._audioCtx;
    if (a && typeof a === 'object') this._ctx = a;
    else if (typeof a === 'function') this._ctx = new a();
    else if (typeof globalThis.AudioContext !== 'undefined') {
      this._ctx = new globalThis.AudioContext();
    } else {
      this._ctx = null;
    }
    if (this._ctx) {
      this._master = this._ctx.createGain();
      this._master.gain.value = this._masterGain;
      if (this._ctx.destination) this._master.connect(this._ctx.destination);
    }
    return this._ctx;
  }

  /**
   * Play a named SFX. No-op when muted or not yet unlocked (no ctx).
   * Otherwise: one oscillator + one gain node, frequency ramp f0->f1 over ms,
   * gain 0.25->0 release, osc.start/stop. <=1 active node pair per play.
   */
  play(name) {
    if (this._muted || !this._ctx) return;
    const spec = sfxSpec(name);
    if (!spec) return;
    const ctx = this._ctx;
    const t0 = ctx.currentTime != null ? ctx.currentTime : 0;
    const dur = spec.ms / 1000;

    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = spec.type;
    osc.frequency.setValueAtTime(spec.f0, t0);
    osc.frequency.linearRampToValueAtTime(spec.f1, t0 + dur);
    env.gain.setValueAtTime(this._masterGain, t0); // 0.25 -> 0 envelope
    env.gain.linearRampToValueAtTime(0, t0 + dur);
    osc.connect(env);
    env.connect(this._master);
    osc.start(t0);
    osc.stop(t0 + dur);
  }

  /** Suppress all output. @returns {boolean} the new flag value. */
  setMuted(muted) {
    this._muted = !!muted;
    return this._muted;
  }

  /** @returns {boolean} current mute flag. */
  isMuted() {
    return this._muted;
  }
}

/**
 * Real backend factory (R-ARCH-03). Accepts an injected mock `audioCtx` for
 * tests; otherwise defaults to `globalThis.AudioContext` (guarded in unlock).
 *
 * @param {{ audioCtx?: object|Function }} [opts]
 * @returns {SoundBackend}
 */
export function createSoundBackend({ audioCtx } = {}) {
  return new SoundBackend({ audioCtx });
}
