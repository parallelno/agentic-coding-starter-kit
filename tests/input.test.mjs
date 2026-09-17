import test from 'node:test';
import assert from 'node:assert/strict';
import { installInput, uninstallInput } from '../js/input/input.js';

// A fake document that collects listeners and can dispatch synthetic events.
function fakeDocument() {
  const listeners = {};
  const doc = {
    addEventListener(type, fn) {
      (listeners[type] = listeners[type] || []).push(fn);
    },
    removeEventListener(type, fn) {
      const arr = listeners[type] || [];
      const i = arr.indexOf(fn);
      if (i >= 0) arr.splice(i, 1);
    },
    _fire(type, e) {
      for (const fn of listeners[type] || []) fn(e);
    },
    _types() {
      return Object.keys(listeners);
    },
  };
  return doc;
}

function setup() {
  const emissions = [];
  const doc = fakeDocument();
  const uninstall = installInput({ emit: (e) => emissions.push(e), document: doc });
  return { emissions, doc, uninstall };
}

test('exported uninstallInput is a callable no-op', () => {
  assert.equal(typeof uninstallInput, 'function');
  uninstallInput();
});

test('each of the 8 direction keys emits exactly one turn with the right dir', () => {
  const cases = [
    ['ArrowUp', { c: 0, r: -1 }],
    ['ArrowDown', { c: 0, r: 1 }],
    ['ArrowLeft', { c: -1, r: 0 }],
    ['ArrowRight', { c: 1, r: 0 }],
    ['KeyW', { c: 0, r: -1 }],
    ['KeyS', { c: 0, r: 1 }],
    ['KeyA', { c: -1, r: 0 }],
    ['KeyD', { c: 1, r: 0 }],
  ];
  for (const [code, dir] of cases) {
    const { emissions, doc } = setup();
    doc._fire('keydown', { code, repeat: false });
    assert.equal(emissions.length, 1, code);
    assert.equal(emissions[0].type, 'turn', code);
    assert.deepEqual(emissions[0].dir, dir, code);
  }
});

test('Space emits start (repeatable); P emits pause; Space never emits pause', () => {
  let { emissions, doc } = setup();
  doc._fire('keydown', { code: 'Space', repeat: false });
  assert.deepEqual(emissions, [{ type: 'start' }]);
  doc._fire('keydown', { code: 'Space', repeat: false });
  assert.equal(emissions.length, 2, 'second Space emits start again');
  assert.deepEqual(emissions[1], { type: 'start' });

  ({ emissions, doc } = setup());
  doc._fire('keydown', { code: 'KeyP', repeat: false });
  assert.deepEqual(emissions, [{ type: 'pause' }]);

  ({ emissions, doc } = setup());
  doc._fire('keydown', { code: 'Space', repeat: false });
  assert.equal(emissions.some((e) => e.type === 'pause'), false, 'Space is not a pause');
});

test('KeyM emits mute', () => {
  const { emissions, doc } = setup();
  doc._fire('keydown', { code: 'KeyM', repeat: false });
  assert.deepEqual(emissions, [{ type: 'mute' }]);
});

test('repeat keydown does not double-emit', () => {
  const { emissions, doc } = setup();
  doc._fire('keydown', { code: 'ArrowUp', repeat: false });
  doc._fire('keydown', { code: 'ArrowUp', repeat: true });
  assert.equal(emissions.length, 1);
});

test('synthetic swipe behaviors', () => {
  // touch swipe up 40px -> turn {0,-1}
  {
    const { emissions, doc } = setup();
    doc._fire('pointerdown', { pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 100 });
    doc._fire('pointerup', { pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 60 });
    assert.deepEqual(emissions, [{ type: 'turn', dir: { c: 0, r: -1 } }]);
  }
  // 30px diagonal -> no emit
  {
    const { emissions, doc } = setup();
    doc._fire('pointerdown', { pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 100 });
    doc._fire('pointerup', { pointerId: 1, pointerType: 'touch', clientX: 130, clientY: 70 });
    assert.equal(emissions.length, 0);
  }
  // 20px vertical -> no emit (below threshold)
  {
    const { emissions, doc } = setup();
    doc._fire('pointerdown', { pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 100 });
    doc._fire('pointerup', { pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 80 });
    assert.equal(emissions.length, 0);
  }
  // mouse swipe -> no emit
  {
    const { emissions, doc } = setup();
    doc._fire('pointerdown', { pointerId: 1, pointerType: 'mouse', clientX: 100, clientY: 100 });
    doc._fire('pointerup', { pointerId: 1, pointerType: 'mouse', clientX: 100, clientY: 40 });
    assert.equal(emissions.length, 0);
  }
  // touch swipe right 50px -> turn {1,0}
  {
    const { emissions, doc } = setup();
    doc._fire('pointerdown', { pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 100 });
    doc._fire('pointerup', { pointerId: 1, pointerType: 'touch', clientX: 150, clientY: 100 });
    assert.deepEqual(emissions, [{ type: 'turn', dir: { c: 1, r: 0 } }]);
  }
});

test('uninstall removes all listeners; reinstall re-arms without duplication', () => {
  const doc = fakeDocument();
  const emissions = [];
  const emit = (e) => emissions.push(e);
  let uninstall = installInput({ emit, document: doc });

  doc._fire('keydown', { code: 'ArrowUp', repeat: false });
  assert.equal(emissions.length, 1, 'installed -> one emit');

  uninstall();
  doc._fire('keydown', { code: 'ArrowUp', repeat: false });
  assert.equal(emissions.length, 1, 'uninstalled -> no new emit');

  // reinstall on the SAME document must not create duplicate handlers
  uninstall = installInput({ emit, document: doc });
  doc._fire('keydown', { code: 'ArrowUp', repeat: false });
  assert.equal(emissions.length, 2, 'reinstall -> exactly one more emit (no double-listener)');
  uninstall();
});
