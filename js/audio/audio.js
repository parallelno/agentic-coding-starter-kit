// js/audio/audio.js
import { bus } from '../util/eventBus.js';

// Shared white-noise buffer factory. Built from Math.random samples into a
// Float32 buffer. Reused by the ambient loop and by the splash SFX so the
// buffer is only synthesized once after unlock.
function makeNoiseBuffer(ac, seconds) {
  const length = Math.max(1, Math.floor(ac.sampleRate * seconds));
  const buffer = ac.createBuffer(1, length, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

class AudioEngine {
  constructor() {
    // Nothing here touches the WebAudio API. The AudioContext is created
    // lazily inside unlock() so module load never triggers autoplay errors.
    this.ac = null;
    this.master = null;
    this.started = false;
    this._muted = false;
    this._noise = null; // cached 2 s noise buffer
    this._ambientStarted = false;
    this._unsub = bus.on('sfx', (p) => this.play(p && p.name));
  }

  // Idempotent unlock: create/resume the AudioContext on a user gesture,
  // build the master gain and start the ambient loop exactly once.
  unlock() {
    if (!this.ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ac = new AC();
      this.master = this.ac.createGain();
      this.master.gain.value = this._muted ? 0 : 0.6;
      this.master.connect(this.ac.destination);
      // Build the noise buffer up front (once) so splash/ambient share it.
      this._noise = makeNoiseBuffer(this.ac, 2);
    }
    if (this.ac.state === 'suspended') this.ac.resume();
    // Mark started BEFORE starting ambient so play() is live immediately.
    this.started = true;
    if (!this._ambientStarted) {
      this._startAmbient();
      this._ambientStarted = true;
    }
  }

  // Looped white-noise bed through a lowpass -> the "wind/pond" ambience.
  _startAmbient() {
    const ac = this.ac;
    const src = ac.createBufferSource();
    src.buffer = this._noise;
    src.loop = true;
    const lowpass = ac.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 400;
    const gain = ac.createGain();
    gain.gain.value = 0.04;
    src.connect(lowpass);
    lowpass.connect(gain);
    gain.connect(this.master);
    src.start();
  }

  // No-op before unlock (autoplay-safe). Synthesizes per name after unlock.
  play(name) {
    if (!this.started || !this.ac || name == null) return;
    switch (name) {
      case 'eat': this._eat(); break;
      case 'death': this._death(); break;
      case 'ui': this._ui(); break;
      case 'turn': this._turn(); break;
      case 'splash': this._splash(); break;
      default: break;
    }
  }

  // Gate the output. When the context exists, retune master gain live.
  setMuted(m) {
    this._muted = !!m;
    if (this.master && this.ac) {
      this.master.gain.setTargetAtTime(this._muted ? 0 : 0.6, this.ac.currentTime, 0.01);
    }
  }

  // --- SFX synthesis -------------------------------------------------------

  // Short sine arpeggio up: 520 -> 780 -> 1046 Hz, ~90 ms total.
  _eat() {
    const ac = this.ac, t = ac.currentTime;
    const notes = [520, 780, 1046];
    const step = 0.03; // 30 ms per note
    notes.forEach((f, i) => this._osc('sine', f, t + i * step, 0.035, 0.15));
  }

  // Very soft ~60 ms square click at 180 Hz, low gain.
  _turn() {
    const ac = this.ac;
    this._osc('square', 180, ac.currentTime, 0.06, 0.05);
  }

  // ~5 ms tick, 900 Hz sine, small gain.
  _ui() {
    const ac = this.ac;
    this._osc('sine', 900, ac.currentTime, 0.005, 0.08);
  }

  // Band-passed white-noise burst (~400 ms) with a lowpass sweep down.
  _splash() {
    const ac = this.ac, t = ac.currentTime, dur = 0.4;
    const src = ac.createBufferSource();
    src.buffer = this._noise;
    const band = ac.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 1200;
    band.Q.value = 0.7;
    const low = ac.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.setValueAtTime(4000, t);
    low.frequency.exponentialRampToValueAtTime(300, t + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(band);
    band.connect(low);
    low.connect(g);
    g.connect(this.master);
    src.start(t, Math.random() * 0.5, dur + 0.05);
    src.stop(t + dur + 0.05);
  }

  // Descending sawtooth 400 -> 80 Hz over ~500 ms + a noise thud, gain to 0.
  _death() {
    const ac = this.ac, t = ac.currentTime, dur = 0.5;
    const osc = ac.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(400, t);
    osc.frequency.exponentialRampToValueAtTime(80, t + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.3, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);

    // Noise "thud": short lowpassed burst.
    const ns = ac.createBufferSource();
    ns.buffer = this._noise;
    const nf = ac.createBiquadFilter();
    nf.type = 'lowpass';
    nf.frequency.value = 200;
    const ng = ac.createGain();
    ng.gain.setValueAtTime(0.25, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    ns.connect(nf);
    nf.connect(ng);
    ng.connect(this.master);
    ns.start(t, 0.0, 0.3);
    ns.stop(t + 0.3);
  }

  // Helper: one oscillator with a quick linear attack/decay envelope.
  _osc(type, freq, start, dur, peak) {
    const ac = this.ac;
    const osc = ac.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const g = ac.createGain();
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(peak, start + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(start);
    osc.stop(start + dur + 0.02);
  }
}

const audio = new AudioEngine();
export default audio;
export { AudioEngine as Audio };
