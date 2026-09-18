/**
 * Tiny typed event bus. Decouples gameplay (game) from presentation
 * (camera shake, particles, audio): modules subscribe, never reference each other.
 */
export class Events {
  constructor() {
    /** @type {Map<string, Set<Function>>} */
    this._map = new Map();
  }

  /**
   * @param {string} name
   * @param {(payload?: any) => void} fn
   * @returns {() => void} unsubscribe
   */
  on(name, fn) {
    let set = this._map.get(name);
    if (!set) { set = new Set(); this._map.set(name, set); }
    set.add(fn);
    return () => set.delete(fn);
  }

  /** @param {string} name @param {any} [payload] */
  emit(name, payload) {
    const set = this._map.get(name);
    if (!set) return;
    for (const fn of [...set]) fn(payload);
  }
}

/** Canonical event names shared across modules. */
export const EVT = {
  COLLECT: 'game:collect',   // payload: { score, apples }
  DIE: 'game:die',           // payload: { cause: 'self' | 'wall' | 'pond', score }
  RESTART: 'game:restart'
};