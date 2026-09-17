// js/input/input.js — DOM-adapter-only input module (T03).
//
// Pure mapping logic (key + swipe normalization) is testable against a fake
// document. No engine/three/other-module imports; no module-level mutable state
// outside the single install closure. `installInput` is the only entry point.

// R-INPUT-01 key -> turn direction. up = -r = -Z; down = +r = +Z.
const KEY_DIRS = {
  ArrowUp: { c: 0, r: -1 },
  ArrowDown: { c: 0, r: 1 },
  ArrowLeft: { c: -1, r: 0 },
  ArrowRight: { c: 1, r: 0 },
  KeyW: { c: 0, r: -1 },
  KeyS: { c: 0, r: 1 },
  KeyA: { c: -1, r: 0 },
  KeyD: { c: 1, r: 0 },
};

// Swipe thresholds (CSS pixels), per R-INPUT-02.
const MIN_SWIPE = 24; // max(|dx|,|dy|) must reach this to count.
const DOMINATE = 1.5; // one axis must dominate by this multiple...
const SMALL_AXIS = 8; // ...or the other axis must be below this.

/**
 * Normalize a swipe (CSS-pixel deltas) into a turn event or null.
 * up = -r = -Z (matches the key mapping); mouse clicks never turn.
 */
export function swipeToTurn({ type, dx, dy } = {}) {
  if (type && type !== 'touch' && type !== 'pen') return null;
  const adx = Math.abs(dx || 0);
  const ady = Math.abs(dy || 0);
  if (Math.max(adx, ady) < MIN_SWIPE) return null;

  let dir = null;
  if (adx >= ady * DOMINATE || ady < SMALL_AXIS) {
    dir = { c: dx < 0 ? -1 : 1, r: 0 };
  } else if (ady >= adx * DOMINATE || adx < SMALL_AXIS) {
    dir = { c: 0, r: dy < 0 ? -1 : 1 };
  } else {
    return null; // comparable axes (e.g. 30,30) -> no turn
  }
  return { type: 'turn', dir };
}

/**
 * Register `keydown` plus `pointerdown/move/up` on `document`; deliver
 * normalized `{type, dir?}` events to `emit`. Returns `uninstallInput()` which
 * removes every listener. The whole closure is the only state; nothing leaks
 * across an uninstall, and re-install never stacks duplicate listeners.
 */
export function installInput({ emit, document }) {
  const pointer = { down: false, startX: 0, startY: 0, startType: null };

  const onKeyDown = (ev) => {
    const code = ev && ev.code;
    if (code == null) return;
    if (KEY_DIRS[code]) {
      emit({ type: 'turn', dir: { ...KEY_DIRS[code] } });
      return;
    }
    // Space/Enter are exclusively start; KeyP is exclusively pause, so a single
    // press never emits both types (state filtering is the consumer's job).
    if (code === 'Space' || code === 'Enter') {
      emit({ type: 'start' });
      return;
    }
    if (code === 'KeyP') {
      emit({ type: 'pause' });
      return;
    }
    if (code === 'KeyM') {
      emit({ type: 'mute' });
    }
  };

  const onPointerDown = (ev) => {
    const x = ev && (ev.clientX ?? ev.pageX);
    const y = ev && (ev.clientY ?? ev.pageY);
    if (typeof x !== 'number' || typeof y !== 'number') return;
    pointer.down = true;
    pointer.startX = x;
    pointer.startY = y;
    pointer.startType = ev && ev.pointerType;
  };

  const onPointerMove = (ev) => {
    if (!pointer.down) return;
    // Track live position if the runtime provides it; harmless otherwise.
    const x = ev && (ev.clientX ?? ev.pageX);
    const y = ev && (ev.clientY ?? ev.pageY);
    if (typeof x === 'number') pointer.lastX = x;
    if (typeof y === 'number') pointer.lastY = y;
  };

  const onPointerUp = (ev) => {
    if (!pointer.down) return;
    const x = ev && (ev.clientX ?? ev.pageX);
    const y = ev && (ev.clientY ?? ev.pageY);
    const pt = ev && ev.pointerType != null ? ev.pointerType : pointer.startType;
    if (typeof x === 'number' && typeof y === 'number') {
      const evt = swipeToTurn({ type: pt, dx: x - pointer.startX, dy: y - pointer.startY });
      if (evt) emit(evt);
    }
    pointer.down = false;
  };

  const handlers = [
    ['keydown', onKeyDown],
    ['pointerdown', onPointerDown],
    ['pointermove', onPointerMove],
    ['pointerup', onPointerUp],
  ];
  for (const [type, fn] of handlers) document.addEventListener(type, fn);

  return function uninstallInput() {
    for (const [type, fn] of handlers) document.removeEventListener(type, fn);
  };
}
