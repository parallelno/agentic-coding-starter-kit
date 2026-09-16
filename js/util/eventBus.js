// js/util/eventBus.js
class Emitter {
  #m = new Map(); // event -> Set<fn>
  on(event, fn) {
    if (!this.#m.has(event)) this.#m.set(event, new Set());
    this.#m.get(event).add(fn);
    return () => this.off(event, fn); // return disposer
  }
  off(event, fn) { this.#m.get(event)?.delete(fn); }
  emit(event, payload) { this.#m.get(event)?.forEach((fn) => fn(payload)); }
}
const bus = new Emitter();
export { bus };
export default bus;
