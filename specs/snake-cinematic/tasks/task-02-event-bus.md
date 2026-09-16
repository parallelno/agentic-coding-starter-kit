# Task 02 — Event Bus

- **Wave:** 1
- **Files to create:** `js/util/eventBus.js`
- **Depends on:** nothing.

## Description

A tiny, framework-free pub/sub singleton that decouples gameplay from rendering,
audio, camera, and UI. It is the single communication channel — no module
imports another gameplay/visual module directly; they talk through this bus.

Event names and payloads are fixed (see requirements.md §Events):
`shake{power}`, `sfx{name}`, `speed{value}`, `score{value}`, `state{value}`.

## Technical spec

```js
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
```

Consumers (later tasks) import it as:
`import { bus } from '../util/eventBus.js';` and call `bus.on('sfx', (p)=>…)` /
`bus.emit('shake', { power: 0.4 })`.

Do NOT use DOM events. Keep it synchronous, zero allocation per emit.

## Acceptance criteria
- `on` returns a disposer that removes the handler.
- Emitting to an event with no subscribers is a no-op (no throw).
- A subscriber added in one file receives emits from another file (single shared
  instance).
