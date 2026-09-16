import { bus } from '../util/eventBus.js';

// Procedural WebAudio SFX. All sound is synthesized (oscillators + noise
// buffers + filters + envelopes); no audio files. The AudioContext is created
// lazily on the first user gesture via unlock() to satisfy autoplay policy.
export class Audio {
  constructor() {
    this.ac = null;
    this.master = null;
    this.ambient = null;
    this.ambientGain = null;
    this.started = false;
    this.muted = false;
    // Lazy-cached noise buffers.
    this._buf = {};
    bus.on('sfx', (p) => this.play(p && p.name));
  }

  unlock() {
    if (this.started) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ac = new AC();
    if (this.ac.state === 'suspended') this.ac.resume();

    this.master = this.ac.createGain();
    this.master.gain.value = this.muted ? 0 : 0.6;
    this.master.connect(this.ac.destination);

    this._startAmbient();
    this.started = true;
  }

  setMuted(m) {
    this.muted = !!m;
    if (this.master) this.master.gain.value = m ? 0 : 0.6;
  }

  play(name) {
    if (!this.started || !this.ac) return;
    const ac = this.ac;
    const t0 = ac.currentTime;
    switch (name) {
      case 'eat': this._eat(t0); break;
      case 'death': this._death(t0); break;
      case 'splash': this._splash(t0); break;
      case 'turn': this._tone('square', 180, t0, 0.06, 0.1); break;
      case 'ui': this._tone('sine', 900, t0, 0.005, 0.05); break;
      default: break; // unknown -> silent no-op
    }
  }

  // ---- synthesis helpers -------------------------------------------------

  // Single oscillator with a 0 -> peak -> 0 gain envelope.
  _tone(type, freq, t, dur, peak) {
    const ac = this.ac;
    const osc = ac.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const g = ac.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + dur * 0.2);
    g.gain.linearRampToValueAtTime(0, t + dur);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  // 3 quick ascending sine notes.
  _eat(t0) {
    const notes = [520, 780, 1046];
    let t = t0;
    for (const f of notes) {
      this._tone('sine', f, t, 0.09, 0.3);
      t += 0.09;
    }
  }

  // Descending sawtooth + short noise thud.
  _death(t0) {
    const ac = this.ac;
    const osc = ac.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(400, t0);
    osc.frequency.exponentialRampToValueAtTime(80, t0 + 0.5);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.5, t0);
    g.gain.linearRampToValueAtTime(0, t0 + 0.5);
    osc.connect(g).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + 0.52);

    this._noiseBurst(this._bufs(0.08), t0, 0.08, 0.3, 'lowpass', 200);
  }

  // Band-passed white-noise burst with a lowpass sweep down (water).
  _splash(t0) {
    const ac = this.ac;
    const src = ac.createBufferSource();
    src.buffer = this._bufs(0.4);
    const bp = ac.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 800;
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(4000, t0);
    lp.frequency.exponentialRampToValueAtTime(400, t0 + 0.4);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.4, t0);
    g.gain.linearRampToValueAtTime(0, t0 + 0.4);
    src.connect(bp).connect(lp).connect(g).connect(this.master);
    src.start(t0);
    src.stop(t0 + 0.42);
  }

  // One-shot noise burst with optional filter + linear gain envelope.
  _noiseBurst(buffer, t, dur, peak, filterType, freq) {
    const ac = this.ac;
    const src = ac.createBufferSource();
    src.buffer = buffer;
    let node = src;
    if (filterType) {
      const f = ac.createBiquadFilter();
      f.type = filterType;
      f.frequency.value = freq;
      node.connect(f);
      node = f;
    }
    const g = ac.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + dur * 0.1);
    g.gain.linearRampToValueAtTime(0, t + dur);
    node.connect(g).connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  // Looped lowpassed white-noise bed (wind/pond).
  _startAmbient() {
    const ac = this.ac;
    const src = ac.createBufferSource();
    src.buffer = this._bufs(2);
    src.loop = true;
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 400;
    const g = ac.createGain();
    g.gain.value = 0.04;
    src.connect(lp).connect(g).connect(this.master);
    src.start();
    this.ambient = src;
    this.ambientGain = g;
  }

  // Lazily create + cache a mono white-noise buffer of the given length.
  _bufs(seconds) {
    if (!this._buf[seconds]) {
      this._buf[seconds] = this.makeNoiseBuffer(seconds);
    }
    return this._buf[seconds];
  }

  makeNoiseBuffer(seconds) {
    const ac = this.ac;
    const size = Math.floor(ac.sampleRate * seconds);
    const buf = ac.createBuffer(1, size, ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < size; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }
}

// Singleton consumed by the rest of the app (integration wires unlock()).
export default new Audio();
