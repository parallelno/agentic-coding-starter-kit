# Task 05 — Audio (procedural WebAudio)

- **Wave:** 2
- **Files to create:** `js/audio/audio.js`
- **Depends on:** `js/util/eventBus.js` (`bus`), (no game modules).

## Description

Generates all sound in code with WebAudio (oscillators, noise buffers, filters,
envelopes). **No audio files.** Must satisfy browser autoplay policy: lazily
create/resume the `AudioContext` on the first user gesture. Subscribes to the
`sfx` bus event and maps names to synthesized sounds. A soft ambient wind/water
loop plays continuously at low gain after unlock.

SFX names (fixed): `eat`, `death`, `ui`, `turn`, `splash`.

## Technical spec

```js
import { bus } from '../util/eventBus.js';

export class Audio {
  constructor() { this.ac = null; this.master = null; this.started=false;
                  bus.on('sfx', (p)=>this.play(p && p.name)); }
  unlock() { // idempotent; create AudioContext, master gain(~0.6), start ambient
  }
  play(name) { /* if !this.started return; synthesize per name */ }
  setMuted(m) {}
}
```

Implementation guidance (keep gains modest, avoid clipping):
- `eat`: short sine blip arpeggio up (e.g. 3 quick notes 520→780→1046 Hz), ~90 ms.
- `turn`: very soft 60 ms square/click at low gain, 180 Hz.
- `splash`: band-passed white-noise burst (~400 ms) with a lowpass sweep down
  (water).
- `death`: descending sawtooth (400→80 Hz over ~500 ms) + a noise thud, gain
  envelope to 0.
- `ui`: 5 ms tick, 900 Hz sine, small.
- Ambient: looped white-noise buffer through a lowpass (~400 Hz) at very low
  gain (~0.04) — the "wind/pond" bed. Create a 2 s noise buffer once and loop.
- Use a shared `makeNoiseBuffer(seconds)` helper; reuse it for splash + ambient.
- All nodes connect `osc/gain -> master`. Wrap `play()` so it is a no-op before
  `unlock()` (autoplay-safe). Expose a singleton `export default new Audio()`.

Consumers call `audio.unlock()` on first input (wired in the integration task)
and never call `AudioContext` synchronously at module load.

## Acceptance criteria
- Constructing the module at load does NOT create an AudioContext (no autoplay
  error / no "started before gesture" warning).
- After `unlock()`, `play('eat')`, `play('death')` etc. produce distinct
  synthesized sounds; no asset file is loaded.
- `bus.emit('sfx', {name:'ui'})` triggers the tick (subscribing works).
- `setMuted(true)` silences output; ambient loop starts only after `unlock()`.
