// T11 (HUD + audio) — Node tests under the project's plain node --test runner.
// No real DOM, so Hud is exercised against a tiny fake document. Importing
// audio.js here (no AudioContext under Node) doubles as the "no throw on
// import" check (R-ARCH-04).
import test from 'node:test';
import assert from 'node:assert/strict';

// Importing audio.js under Node (no AudioContext) must NOT throw (R-ARCH-04).
import { Hud, createHud, formatHud, overlayFor } from '../js/ui/hud.js';
import { SoundBackend, createSoundBackend, sfxSpec } from '../js/ui/audio.js';

// ---------------------------------------------------------------------------
// formatHud (pure)
// ---------------------------------------------------------------------------
test('formatHud: hand-built snapshot -> exact display strings', () => {
  const evt = { score: 30, length: 6, best: 120, top: [{ score: 120 }] };
  assert.deepEqual(formatHud(evt), {
    score: 'score: 30',
    length: 'length: 6',
    best: 'best: 120'
  });
});

test('formatHud: absent best/top -> best 0, still well-formed', () => {
  const out = formatHud({ score: 5, length: 4 });
  assert.equal(out.best, 'best: 0');
  assert.equal(out.score, 'score: 5');
  assert.equal(out.length, 'length: 4');
});

// ---------------------------------------------------------------------------
// overlayFor (pure)
// ---------------------------------------------------------------------------
test('overlayFor: menu -> key menu, correct CTA', () => {
  const m = overlayFor({ state: 'menu', top: [] });
  assert.equal(m.key, 'menu');
  assert.equal(m.cta, 'space to start');
  assert.deepEqual(m.rows, []);
});

test('overlayFor: paused -> key paused, correct CTA', () => {
  const m = overlayFor({ state: 'paused', top: [] });
  assert.equal(m.key, 'paused');
  assert.equal(m.cta, 'space to resume');
});

test('overlayFor: dead (loss) -> key dead, correct CTA', () => {
  const m = overlayFor({ state: 'dead', won: false, top: [] });
  assert.equal(m.key, 'dead');
  assert.equal(m.cta, 'space to play again');
});

test('overlayFor: dead with won=true -> key won', () => {
  const m = overlayFor({ state: 'dead', won: true, top: [{ score: 200 }] });
  assert.equal(m.key, 'won');
  assert.equal(m.cta, 'space to play again');
});

test('overlayFor: top-3 from a 5-entry list, stable order', () => {
  const top = [
    { score: 500 }, { score: 400 }, { score: 300 }, { score: 200 }, { score: 100 }
  ];
  const m = overlayFor({ state: 'dead', won: false, top });
  assert.deepEqual(m.rows, ['#1. 500', '#2. 400', '#3. 300']);
  assert.equal(m.rows.length, 3);
});

// ---------------------------------------------------------------------------
// SoundBackend with a spy context
// ---------------------------------------------------------------------------
function makeSpyCtx() {
  const ops = { createOscillator: 0, freq: { setValue: [], ramp: [] }, gain: { setValue: [], ramp: [] } };
  // A mock AudioParam recording its own setValue/ramp ops.
  const makeParam = (bucket) => ({
    setValueAtTime(v, t) { bucket.setValue.push({ v, t }); },
    linearRampToValueAtTime(v, t) { bucket.ramp.push({ v, t }); }
  });
  const mkNode = (kind) => {
    return {
      _kind: kind,
      type: null,
      frequency: makeParam(ops.freq),
      gain: makeParam(ops.gain),
      connect() { return this; },
      start() { ops.started = (ops.started || 0) + 1; },
      stop() { ops.stopped = (ops.stopped || 0) + 1; },
      onended: null,
      _endedNow() {
        if (this.onended) this.onended();
      }
    };
  };
  const ctx = {
    ops,
    currentTime: 0.5,
    destination: { _dest: true },
    createOscillator() {
      ops.createOscillator++;
      const n = mkNode('osc');
      ops.lastOsc = n;
      return n;
    },
    createGain() {
      ops.lastGain = mkNode('gain');
      return ops.lastGain;
    }
  };
  return ctx;
}

test('SoundBackend: play("eat") unmuted -> one osc, square, freq ramp, gain 0.25', () => {
  const spy = makeSpyCtx();
  const sb = createSoundBackend({ audioCtx: spy });
  sb.unlock();
  sb.play('eat');
  assert.equal(spy.ops.createOscillator, 1, 'exactly one oscillator');
  assert.equal(spy.ops.lastOsc.type, 'square');
  const set = spy.ops.freq.setValue.find((o) => o.v === 660);
  assert.ok(set, 'frequency.setValueAtTime(660)');
  const ramp = spy.ops.freq.ramp.find((o) => Math.abs(o.v - 880) < 1e-9);
  assert.ok(ramp, 'frequency.linearRampToValueAtTime(880)');
  // ramp at t0 + 80ms, tolerant on the absolute t base
  assert.ok(Math.abs(ramp.t - (0.5 + 0.08)) < 1e-6, `ramp time ~ +0.08 (got ${ramp.t})`);
  const g = spy.ops.gain.setValue.find((o) => o.v === 0.25);
  assert.ok(g, 'gain 0.25');
});

test('SoundBackend: setMuted(true) -> zero oscillator-creation ops', () => {
  const spy = makeSpyCtx();
  const sb = createSoundBackend({ audioCtx: spy });
  sb.unlock();
  sb.setMuted(true);
  assert.equal(sb.isMuted(), true);
  sb.play('eat');
  assert.equal(spy.ops.createOscillator, 0, 'no oscillator while muted');
});

test('SoundBackend: isMuted reflects the flag', () => {
  const sb = createSoundBackend({ audioCtx: makeSpyCtx() });
  assert.equal(sb.isMuted(), false);
  sb.setMuted(true);
  assert.equal(sb.isMuted(), true);
  sb.setMuted(false);
  assert.equal(sb.isMuted(), false);
});

test('SoundBackend: play before unlock -> no-op, no throw', () => {
  const spy = makeSpyCtx();
  const sb = createSoundBackend({ audioCtx: spy });
  assert.doesNotThrow(() => sb.play('eat'));
  assert.equal(spy.ops.createOscillator, 0, 'no oscillator before unlock');
});

test('sfxSpec: known names resolve, unknown -> null', () => {
  assert.equal(sfxSpec('eat').type, 'square');
  assert.equal(sfxSpec('death').type, 'sawtooth');
  assert.equal(sfxSpec('resume').type, 'sine');
  assert.equal(sfxSpec('nope'), null);
});

// ---------------------------------------------------------------------------
// Hud DOM class (fake document: nodes created once, mutated per update)
// ---------------------------------------------------------------------------
class FakeNode {
  constructor(tag) {
    this.tagName = tag;
    this.textContent = '';
    this.children = [];
    this.style = {};
    this._cls = new Set();
  }
  get className() {
    return [...this._cls].join(' ');
  }
  set className(v) {
    this._cls = new Set(String(v).split(/\s+/).filter(Boolean));
  }
  get classList() {
    const s = this._cls;
    return {
      add: (...c) => c.forEach((x) => s.add(x)),
      remove: (...c) => c.forEach((x) => s.delete(x)),
      toggle: (c, force) => {
        const on = force === undefined ? !s.has(c) : !!force;
        if (on) s.add(c);
        else s.delete(c);
        return on;
      },
      contains: (c) => s.has(c)
    };
  }
  append(...ns) {
    for (const n of ns) {
      this.children.push(n);
      n.parent = this;
    }
  }
  appendChild(n) {
    this.children.push(n);
    n.parent = this;
    return n;
  }
  get lastElementChild() {
    return this.children.length ? this.children[this.children.length - 1] : null;
  }
}

function makeFakeDocument() {
  const state = { created: 0, root: null };
  function count() {
    state.created++;
  }
  return {
    document: {
      createElement: (tag) => {
        count();
        return new FakeNode(tag);
      },
      _state: state
    }
  };
}

// Wire the fake document so the module's `document` global resolves to it.
const { document, _state } = (() => {
  const m = makeFakeDocument();
  globalThis.document = m.document;
  return { document: m.document, _state: m.document._state };
})();

test('Hud: builds DOM once; setState mutates without creating new nodes', () => {
  const container = new FakeNode('div');
  const before = _state.created;
  const hud = createHud(container);
  const afterBuild = _state.created;
  assert.ok(afterBuild > before, 'constructor creates nodes');

  hud.setState({ state: 'menu', score: 0, length: 3, best: 0, top: [] });
  hud.setState({ state: 'playing', score: 10, length: 4, best: 50, top: [] });
  hud.setState({ state: 'dead', won: false, score: 20, length: 5, best: 50,
    top: [{ score: 50 }, { score: 30 }, { score: 20 }, { score: 10 }, { score: 5 }] });
  const afterUpdates = _state.created;
  assert.equal(afterUpdates, afterBuild, 'no new DOM nodes during setState');

  // The dead overlay is visible with exactly 3 populated rows.
  const deadOverlay = container.children.find((c) => c._cls.has('dead'));
  assert.ok(deadOverlay, 'dead overlay exists');
  assert.ok(!deadOverlay.classList.contains('hidden'), 'dead overlay shown while dead');
  const menuOverlay = container.children.find((c) => c._cls.has('menu'));
  assert.ok(menuOverlay.classList.contains('hidden'), 'menu overlay hidden while dead');
});

test('Hud: setMuted toggles the mute-flag visibility', () => {
  const container = new FakeNode('div');
  const hud = new Hud(container);
  const flag = container.children.find((c) => c._cls.has('mute-flag'));
  assert.ok(flag, 'mute flag exists');
  assert.ok(flag.classList.contains('hidden'), 'hidden when unmuted');
  hud.setMuted(true);
  assert.ok(!flag.classList.contains('hidden'), 'visible when muted');
});

test('Hud: stat bar shows score/length/best numbers', () => {
  const container = new FakeNode('div');
  const hud = new Hud(container);
  hud.setState({ state: 'playing', score: 42, length: 7, best: 999 });
  const bar = container.children.find((c) => c._cls.has('hud-bar'));
  const values = [];
  for (const stat of bar.children) {
    const val = stat.children.find((ch) => ch._cls.has('value'));
    values.push(val.textContent);
  }
  assert.deepEqual(values, ['42', '7', '999']);
});
