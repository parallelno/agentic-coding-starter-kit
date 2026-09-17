// tests/hud.test.mjs — Task 11 (HUD + synthesized audio).
// Pure-logic + SoundBackend assertions exercised under Node (R-TEST-01):
// NO DOM and NO global AudioContext exist here. Both modules must import clean.
import { test } from 'node:test';
import assert from 'node:assert/strict';

// --- Import check: importing both modules under Node (no AudioContext / DOM)
//     must NOT throw. If it did, this file would fail to load at all. ---
import { formatHud, overlayFor, Hud } from '../js/ui/hud.js';
import { sfxSpec, SoundBackend, createSoundBackend } from '../js/ui/audio.js';

function approx(a, b, eps = 1e-6) {
  assert.ok(Math.abs(a - b) <= eps, `expected ${a} ≈ ${b} (±${eps})`);
}

// ===========================================================================
// formatHud
// ===========================================================================
test('formatHud: hand-built event -> exact display strings ("label: value")', () => {
  const out = formatHud({ score: 30, length: 6, best: 120 });
  assert.deepEqual(out, { score: 'score: 30', length: 'length: 6', best: 'best: 120' });
});

test('formatHud: absent best -> "best: 0" display', () => {
  const out = formatHud({ score: 10, length: 4 });
  assert.equal(out.best, 'best: 0');
  assert.equal(out.score, 'score: 10');
  assert.equal(out.length, 'length: 4');
});

// ===========================================================================
// overlayFor
// ===========================================================================
test('overlayFor: key for menu', () => {
  const o = overlayFor({ state: 'menu' });
  assert.equal(o.key, 'menu');
  assert.equal(o.cta, 'space to start');
});

test('overlayFor: key for paused (resume cta)', () => {
  const o = overlayFor({ state: 'paused' });
  assert.equal(o.key, 'paused');
  assert.equal(o.cta, 'space to resume');
});

test('overlayFor: key for dead (no won)', () => {
  const o = overlayFor({ state: 'dead', won: false });
  assert.equal(o.key, 'dead');
  assert.equal(o.cta, 'space to play again');
});

test('overlayFor: dead + won -> "won" key', () => {
  const o = overlayFor({ state: 'dead', won: true });
  assert.equal(o.key, 'won');
  assert.equal(o.cta, 'space to play again');
});

test('overlayFor: dead content -> exactly 3 top rows from a 5-entry list', () => {
  const top = [
    { score: 100 },
    { score: 90 },
    { score: 80 },
    { score: 70 },
    { score: 60 },
  ];
  const o = overlayFor({ state: 'dead', won: false, top, score: 90 });
  assert.equal(o.rows.length, 3, 'exactly 3 rows even when top has 5');
  assert.deepEqual(o.rows, ['#1. 100', '#2. 90', '#3. 80']);
});

test('overlayFor: empty/missing top -> no rows', () => {
  assert.deepEqual(overlayFor({ state: 'dead' }).rows, []);
});

// ===========================================================================
// sfxSpec freeze
// ===========================================================================
test('sfxSpec: documented freeze eat/death/resume', () => {
  assert.deepEqual(sfxSpec('eat'), { type: 'square', f0: 660, f1: 880, ms: 80, gain: 1 });
  assert.deepEqual(sfxSpec('death'), { type: 'sawtooth', f0: 440, f1: 110, ms: 400, gain: 1 });
  assert.deepEqual(sfxSpec('resume'), { type: 'sine', f0: 520, f1: 520, ms: 60, gain: 1 });
});

test('sfxSpec: undocumented name -> null', () => {
  assert.equal(sfxSpec('nope'), null);
});

// ===========================================================================
// SoundBackend with a spy audioCtx (plain mock, no real WebAudio)
// ===========================================================================
function makeSpyCtx(baseTime = 10.0) {
  const oscCalls = [];
  const gainCalls = [];
  const frequency = () => {
    const log = [];
    return {
      setValueAtTime: (a, b) => log.push({ fn: 'setValueAtTime', val: a, time: b }),
      linearRampToValueAtTime: (a, b) => log.push({ fn: 'linearRampToValueAtTime', val: a, time: b }),
      log,
    };
  };
  const gainNode = () => {
    const log = [];
    return {
      gain: {
        value: 0,
        setValueAtTime: (a, b) => log.push({ fn: 'setValueAtTime', val: a, time: b }),
        linearRampToValueAtTime: (a, b) => log.push({ fn: 'linearRampToValueAtTime', val: a, time: b }),
      },
      connect: () => {},
      log,
    };
  };
  const spy = {
    get currentTime() {
      return baseTime;
    },
    destination: {},
    createOscillator() {
      const osc = {
        type: '',
        frequency: frequency(),
        connect: () => {},
        __started: [],
        __stopped: [],
        start(t) {
          osc.__started.push(t);
        },
        stop(t) {
          osc.__stopped.push(t);
        },
      };
      oscCalls.push(osc);
      return osc;
    },
    createGainNode() {
      const g = gainNode();
      gainCalls.push(g);
      return g;
    },
    // WebAudio's real method; some code/tests may call this instead.
    createGain() {
      const g = gainNode();
      gainCalls.push(g);
      return g;
    },
  };
  return { spy, oscCalls, gainCalls };
}

test('SoundBackend: play("eat") after unlock -> one square osc, freq 660->880, master 0.25', () => {
  const { spy, oscCalls, gainCalls } = makeSpyCtx(10.0);
  const sb = createSoundBackend({ audioCtx: spy });
  sb.unlock();
  sb.play('eat');

  assert.equal(oscCalls.length, 1, 'exactly one oscillator per play');
  const osc = oscCalls[0];
  assert.equal(osc.type, 'square');

  const freqLog = osc.frequency.log;
  assert.equal(freqLog.length, 2);
  assert.equal(freqLog[0].fn, 'setValueAtTime');
  approx(freqLog[0].val, 660);
  approx(freqLog[0].time, 10.0);
  assert.equal(freqLog[1].fn, 'linearRampToValueAtTime');
  approx(freqLog[1].val, 880);
  approx(freqLog[1].time, 10.08, 1e-9); // t0 + 80ms

  // master gain node (created on unlock) value ~0.25
  assert.ok(gainCalls.length >= 1);
  approx(gainCalls[0].gain.value, 0.25);

  // env node ramped 0.25 -> 0 over ms
  const env = oscCalls.length ? gainCalls[gainCalls.length - 1] : null;
  assert.ok(env);
  const envLog = env.log;
  approx(envLog[0].val, 0.25);
  approx(envLog[1].val, 0);
});

test('SoundBackend: setMuted(true) -> subsequent play creates ZERO oscillators', () => {
  const { spy, oscCalls } = makeSpyCtx(10.0);
  const sb = createSoundBackend({ audioCtx: spy });
  sb.unlock();
  sb.play('eat'); // one oscillator
  const afterFirst = oscCalls.length;
  assert.equal(afterFirst, 1);

  sb.setMuted(true);
  assert.equal(sb.isMuted(), true, 'isMuted reflects the flag');
  sb.play('eat');
  assert.equal(oscCalls.length, afterFirst, 'muted play adds no oscillator');
  assert.equal(sb.isMuted(), true);
});

test('SoundBackend: isMuted defaults false and toggles', () => {
  const sb = createSoundBackend({});
  assert.equal(sb.isMuted(), false);
  sb.setMuted(true);
  assert.equal(sb.isMuted(), true);
  sb.setMuted(false);
  assert.equal(sb.isMuted(), false);
});

test('SoundBackend: play before unlock (no ctx) is a no-op and does not throw', () => {
  const { spy, oscCalls, gainCalls } = makeSpyCtx(10.0);
  const sb = createSoundBackend({ audioCtx: spy });
  assert.doesNotThrow(() => sb.play('eat'));
  assert.equal(oscCalls.length, 0, 'no oscillator created before unlock');
  assert.equal(gainCalls.length, 0, 'no gain created before unlock');
});

test('SoundBackend: default (no injected ctx) constructs with no AudioContext', () => {
  // globalThis.AudioContext is undefined in Node; construction must not throw.
  assert.doesNotThrow(() => createSoundBackend());
  // unlock() without any available context leaves a null-ish ctx and does not throw.
  const sb = createSoundBackend();
  assert.doesNotThrow(() => sb.unlock());
  assert.doesNotThrow(() => sb.play('eat'));
});

// ===========================================================================
// Hud (DOM) — minimal fake DOM; assert nodes are created ONCE and then only
// mutated (no per-update DOM creation), and `.visible` toggles correctly.
// ===========================================================================
class FakeNode {
  constructor(tag) {
    this.tagName = tag;
    this.className = '';
    this.textContent = '';
    this.children = [];
    this.hidden = false;
    const held = new Set();
    this.classList = {
      add: (n) => held.add(n),
      remove: (n) => held.delete(n),
      contains: (n) => held.has(n),
      toggle: (n, force) => {
        if (force === undefined) {
          held.has(n) ? held.delete(n) : held.add(n);
        } else if (force) held.add(n);
        else held.delete(n);
      },
    };
  }
  appendChild(child) {
    this.children.push(child);
    return child;
  }
}

function makeHudScope() {
  let created = 0;
  const doc = {
    createElement(tag) {
      created += 1;
      return new FakeNode(tag);
    },
  };
  const container = new FakeNode('div');
  container.id = 'hud';
  container.ownerDocument = doc;
  const overlays = () =>
    container.children
      .map((c) => c)
      .filter((c) => c.className.indexOf('overlay') !== -1)
      .map((c) => ({
        cls: c.className,
        visible: () => c.classList.contains('visible'),
      }));
  return { container, created: () => created, overlays };
}

test('Hud: builds DOM once; setState/setMuted mutate without new nodes and toggle .visible', () => {
  const { container, created, overlays } = makeHudScope();
  const hud = new Hud(container);
  const afterBuild = created();
  assert.ok(afterBuild >= 8, 'HUD + overlays + mute flag built at construction');

  const findCls = (token) => overlays().find((o) => o.cls.includes(token));

  hud.setState({ state: 'menu', score: 0, length: 3, best: 0, top: [] });
  assert.equal(created(), afterBuild, 'no DOM creation on setState (menu)');
  assert.equal(findCls('menu').visible(), true, 'menu overlay visible');
  assert.equal(findCls('paused').visible(), false);
  assert.equal(findCls('dead').visible(), false);
  assert.equal(findCls('won').visible(), false);

  hud.setState({
    state: 'dead',
    score: 30,
    length: 6,
    best: 120,
    won: false,
    top: [{ score: 100 }, { score: 90 }, { score: 80 }],
  });
  assert.equal(created(), afterBuild, 'no DOM creation on setState (dead)');
  assert.equal(findCls('dead').visible(), true, 'dead overlay visible on death');
  assert.equal(findCls('menu').visible(), false);

  hud.setState({
    state: 'dead',
    score: 30,
    length: 6,
    best: 120,
    won: true,
    top: [{ score: 95 }, { score: 30 }, { score: 20 }],
  });
  assert.equal(findCls('won').visible(), true, 'won overlay visible on win');
  assert.equal(findCls('dead').visible(), false);

  hud.setState({ state: 'playing', score: 30, length: 6, best: 120, top: [] });
  assert.equal(created(), afterBuild, 'no DOM creation on setState (playing)');
  assert.ok(!overlays().some((o) => o.visible()), 'all overlays hidden while playing');

  hud.setMuted(true);
  assert.equal(created(), afterBuild, 'no DOM creation on setMuted');
  hud.setState({ state: 'playing', score: 30, length: 6, best: 120, top: [] });
  assert.equal(created(), afterBuild);
});
