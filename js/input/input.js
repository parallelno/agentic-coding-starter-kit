// SNAKE — Cinematic Edition: input capture and normalization.
// DOM-adapter-only. Imports NOTHING (document is injected). Normalizes
// keyboard + pointer events into {type, dir?} events delivered to emit().
//
// Event shapes:
//   { type: 'turn', dir: { c, r } } | { type: 'start' } | { type: 'pause' } | { type: 'mute' }
//
// Up on screen = -r = -Z (matches the key mapping).

const SWIPE_MIN = 24; // px, min travel on the dominant axis
const SWIPE_DOMINATE = 1.5; // dominant axis must be >=1.5x the other...
const SWIPE_SMALL = 8; // ...or the other axis must be < 8px

const KEY_DIRS = {
  ArrowUp: { c: 0, r: -1 },
  KeyW: { c: 0, r: -1 },
  ArrowDown: { c: 0, r: 1 },
  KeyS: { c: 0, r: 1 },
  ArrowLeft: { c: -1, r: 0 },
  KeyA: { c: -1, r: 0 },
  ArrowRight: { c: 1, r: 0 },
  KeyD: { c: 1, r: 0 },
};
const START_KEYS = ['Space', 'Enter'];

export function installInput({ emit, document }) {
  const handlers = { keydown: [], pointerdown: [], pointermove: [], pointerup: [] };

  // Per-pointer state; intentionally local to this install so uninstallInput()
  // leaves no module-level state behind.
  let active = null; // { id, startX, startY, pointerType }

  function on(type, handler) {
    handlers[type].push(handler);
    document.addEventListener(type, handler);
  }

  function handleKey(e) {
    if (e.repeat) return; // one physical press -> at most one event
    const code = e && e.code;
    const dir = KEY_DIRS[code];
    if (dir) {
      emit({ type: 'turn', dir });
      return;
    }
    if (START_KEYS.includes(code)) {
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
  }

  function handleDown(e) {
    if (active) return; // ignore secondary pointers
    active = {
      id: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      pointerType: e.pointerType,
    };
  }

  function handleMove(e) {
    if (!active || e.pointerId !== active.id) return;
    // Keep the last position so a drop can be resolved even without an up.
    active.lastX = e.clientX;
    active.lastY = e.clientY;
  }

  function handleUp(e) {
    if (!active || e.pointerId !== active.id) return;
    const start = active;
    active = null;
    // Mouse swipes never turn; only touch/pen do.
    if (start.pointerType === 'mouse') return;
    const endX = e.clientX !== undefined ? e.clientX : start.lastX;
    const endY = e.clientY !== undefined ? e.clientY : start.lastY;
    if (endX === undefined || endY === undefined) return;
    const dx = endX - start.startX;
    const dy = endY - start.startY;
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);
    const max = Math.max(adx, ady);
    if (max < SWIPE_MIN) return; // too short -> no turn
    const horiz = adx >= ady; // which axis travels furthest
    const big = horiz ? adx : ady;
    const small = horiz ? ady : adx;
    // Accept the dominant axis only when it clearly dominates (>=1.5x) or the
    // other axis is negligible (< 8px). Otherwise it is ambiguous -> no turn.
    if (!(big >= SWIPE_DOMINATE * small || small < SWIPE_SMALL)) return;
    emit({ type: 'turn', dir: horiz ? { c: Math.sign(dx), r: 0 } : { c: 0, r: Math.sign(dy) } });
  }

  on('keydown', handleKey);
  on('pointerdown', handleDown);
  on('pointermove', handleMove);
  on('pointerup', handleUp);

  // Returns the uninstall function (also callable as uninstallInput()).
  function uninstall() {
    for (const type in handlers) {
      for (const h of handlers[type]) document.removeEventListener(type, h);
    }
    keysOf(handlers).forEach((k) => (handlers[k] = []));
    active = null;
  }

  return uninstall;
}

function keysOf(obj) {
  return Object.keys(obj);
}

// Standalone uninstallInput() — a no-op guard for API parity (the real
// unsubscription is returned by installInput). No module state is kept.
export function uninstallInput() {}
