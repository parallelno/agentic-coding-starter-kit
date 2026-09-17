// tests/input.test.mjs — T03 task gate: input capture + normalization.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installInput } from '../js/input/input.js';

// Fake document: addEventListener/removeEventListener actually track the
// registered handlers so tests can dispatch events and verify unregistration.
function fakeDocument() {
  const listeners = new Map(); // type -> Array<fn> (registration order preserved)
  return {
    listeners,
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    removeEventListener(type, fn) {
      const arr = listeners.get(type) || [];
      const i = arr.indexOf(fn);
      if (i !== -1) arr.splice(i, 1);
    },
    emit(type, ev) {
      for (const fn of listeners.get(type) || []) fn(ev);
    },
    count(type) {
      return (listeners.get(type) || []).length;
    },
  };
}

// Helper: install with a collecting emit, capture events.
function setup(opts = {}) {
  const emitted = [];
  const document = fakeDocument();
  const uninstall = installInput({ emit: (e) => emitted.push(e), document, ...opts });
  return { emitted, document, uninstall };
}

const DIRS = {
  ArrowUp: { c: 0, r: -1 },
  ArrowDown: { c: 0, r: 1 },
  ArrowLeft: { c: -1, r: 0 },
  ArrowRight: { c: 1, r: 0 },
  KeyW: { c: 0, r: -1 },
  KeyS: { c: 0, r: 1 },
  KeyA: { c: -1, r: 0 },
  KeyD: { c: 1, r: 0 },
};

test('each of the 8 direction keys emits exactly one turn with the right dir', () => {
  for (const [code, dir] of Object.entries(DIRS)) {
    const { emitted, document } = setup();
    document.emit('keydown', { code });
    assert.equal(emitted.length, 1, `${code} emits exactly one event`);
    assert.equal(emitted[0].type, 'turn');
    assert.deepEqual(emitted[0].dir, dir, `${code} direction`);
  }
});

test('Space emits start; a second Space press emits start again', () => {
  const { emitted, document } = setup();
  document.emit('keydown', { code: 'Space' });
  document.emit('keydown', { code: 'Space' });
  assert.equal(emitted.length, 2, 'two presses -> two start events (no in-module dedup)');
  assert.equal(emitted[0].type, 'start');
  assert.equal(emitted[1].type, 'start');
});

test('Space never emits pause, and Enter emits start (not pause)', () => {
  const { emitted, document } = setup();
  document.emit('keydown', { code: 'Space' });
  document.emit('keydown', { code: 'Enter' });
  assert.deepEqual(
    emitted.map((e) => e.type),
    ['start', 'start'],
  );
});

test('KeyP emits pause (single event)', () => {
  const { emitted, document } = setup();
  document.emit('keydown', { code: 'KeyP' });
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].type, 'pause');
});

test('KeyM emits mute', () => {
  const { emitted, document } = setup();
  document.emit('keydown', { code: 'KeyM' });
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].type, 'mute');
});

test('unrelated keys emit nothing', () => {
  const { emitted, document } = setup();
  document.emit('keydown', { code: 'KeyX' });
  document.emit('keydown', { code: 'Digit1' });
  assert.equal(emitted.length, 0);
});

// --- swipe ------------------------------------------------------------------

test('swipe up 40px emits turn {c:0,r:-1}', () => {
  const { emitted, document } = setup();
  document.emit('pointerdown', { pointerType: 'touch', clientX: 50, clientY: 120 });
  document.emit('pointerup', { pointerType: 'touch', clientX: 50, clientY: 80 });
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].type, 'turn');
  assert.deepEqual(emitted[0].dir, { c: 0, r: -1 });
});

test('swipe down 40px emits turn {c:0,r:1}; left/right map to -c/+c', () => {
  const s = setup();
  s.document.emit('pointerdown', { pointerType: 'touch', clientX: 50, clientY: 80 });
  s.document.emit('pointerup', { pointerType: 'touch', clientX: 50, clientY: 120 });
  assert.deepEqual(s.emitted[0].dir, { c: 0, r: 1 });

  const l = setup();
  l.document.emit('pointerdown', { pointerType: 'touch', clientX: 90, clientY: 80 });
  l.document.emit('pointerup', { pointerType: 'touch', clientX: 50, clientY: 80 });
  assert.deepEqual(l.emitted[0].dir, { c: -1, r: 0 });

  const r = setup();
  r.document.emit('pointerdown', { pointerType: 'touch', clientX: 50, clientY: 80 });
  r.document.emit('pointerup', { pointerType: 'touch', clientX: 90, clientY: 80 });
  assert.deepEqual(r.emitted[0].dir, { c: 1, r: 0 });
});

test('30px diagonal (dx=30,dy=30) emits nothing (comparable axes)', () => {
  const { emitted, document } = setup();
  document.emit('pointerdown', { pointerType: 'touch', clientX: 0, clientY: 0 });
  document.emit('pointerup', { pointerType: 'touch', clientX: 30, clientY: 30 });
  assert.equal(emitted.length, 0);
});

test('20px vertical emits nothing (below MIN_SWIPE)', () => {
  const { emitted, document } = setup();
  document.emit('pointerdown', { pointerType: 'touch', clientX: 0, clientY: 0 });
  document.emit('pointerup', { pointerType: 'touch', clientX: 0, clientY: 20 });
  assert.equal(emitted.length, 0);
});

test('mouse pointer swipe emits nothing (mouse clicks never turn)', () => {
  const { emitted, document } = setup();
  document.emit('pointerdown', { pointerType: 'mouse', clientX: 0, clientY: 0 });
  document.emit('pointerup', { pointerType: 'mouse', clientX: 0, clientY: -60 });
  assert.equal(emitted.length, 0);
});

test('swipe requires a prior pointerdown (stray pointerup emits nothing)', () => {
  const { emitted, document } = setup();
  document.emit('pointerup', { pointerType: 'touch', clientX: 0, clientY: -60 });
  assert.equal(emitted.length, 0);
});

// --- lifecycle ---------------------------------------------------------------

test('registering listeners is present on install; uninstall removes all', () => {
  const { document, uninstall } = setup();
  for (const t of ['keydown', 'pointerdown', 'pointermove', 'pointerup']) {
    assert.ok(document.count(t) >= 1, `installed listener for ${t}`);
  }
  uninstall();
  for (const t of ['keydown', 'pointerdown', 'pointermove', 'pointerup']) {
    assert.equal(document.count(t), 0, `uninstall removed ${t} listener`);
  }
});

test('re-after uninstall, a single key press produces a single emit (no duplicates)', () => {
  const { document, uninstall, emitted } = setup();
  uninstall();
  // Re-install on the same fake document.
  const uninstall2 = installInput({ emit: (e) => emitted.push(e), document });
  document.emit('keydown', { code: 'ArrowUp' });
  assert.equal(document.count('keydown'), 1, 'exactly one keydown handler after re-install');
  assert.equal(emitted.length, 1, 'one key press -> one emit');
  assert.deepEqual(emitted[0], { type: 'turn', dir: { c: 0, r: -1 } });
  uninstall2();
});
