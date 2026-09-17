// T11 (audio) — a WebAudio backend. The sfx spec is owned here per R-ARCH-01
// (audio imports js/game/core.js only, never providers/sound.js). No
// AudioContext is created at import time (safe for Node); it is created lazily
// inside `play` only after an explicit `unlock()` (R-UI-01) and a global
// AudioContext exists. With no ctx available (the Node path) play() is a
// no-op. Injecting `audioCtx` lets tests feed a spy context.

const SPECS = {
  eat: { type: 'square', f0: 660, f1: 880, ms: 80, gain: 1 },
  death: { type: 'sawtooth', f0: 440, f1: 110, ms: 400, gain: 1 },
  resume: { type: 'sine', f0: 520, f1: 520, ms: 60, gain: 1 }
};

// Pure: returns the spec for a named sfx, or null if unknown.
export function sfxSpec(name) {
  return SPECS[name] || null;
}

function globalAudioContext() {
  if (typeof globalThis === 'undefined') return null;
  const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
  return typeof AC === 'function' ? new AC() : null;
}

export class SoundBackend {
  constructor(injectedCtx) {
    this._injected = injectedCtx || null;
    this._ctx = null;
    this._unlocked = false;
    this._muted = false;
  }

  // Browser gesture handler calls this first (R-UI-01). Nothing plays before.
  unlock() {
    this._unlocked = true;
  }

  isMuted() {
    return this._muted;
  }

  setMuted(m) {
    this._muted = !!m;
  }

  _ensureCtx() {
    if (this._ctx) return this._ctx;
    this._ctx = this._injected ? this._injected : globalAudioContext();
    return this._ctx;
  }

  play(name) {
    const spec = sfxSpec(name);
    if (!spec || this._muted || !this._unlocked) return;
    const ctx = this._ensureCtx();
    if (!ctx) return; // Node / no AudioContext: no-op.

    const t0 = typeof ctx.currentTime === 'number' ? ctx.currentTime : 0;
    const dur = spec.ms / 1000;
    const release = 0.06;
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    osc.type = spec.type;
    osc.frequency.setValueAtTime(spec.f0, t0);
    osc.frequency.linearRampToValueAtTime(spec.f1, t0 + dur);
    gainNode.gain.setValueAtTime(0.25, t0);
    gainNode.gain.linearRampToValueAtTime(0.0001, t0 + dur + release);
    osc.connect(gainNode);
    gainNode.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + release);
    // eslint-disable-next-line handle-callback-err
    osc.onended = () => {
      try {
        osc.disconnect();
        gainNode.disconnect();
      } catch {
        /* already disconnected */
      }
    };
  }
}

export function createSoundBackend({ audioCtx } = {}) {
  return new SoundBackend(audioCtx);
}
