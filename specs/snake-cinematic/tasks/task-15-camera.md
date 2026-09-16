# Task 15 — Camera (follow + event-driven shake)

- **Wave:** 3
- **Files to create:** `js/camera/camera.js`
- **Depends on:** `js/renderer/renderer.js` (W2, gives `camera` / `quality`),
  `js/util/eventBus.js` (W1, `bus`), `js/config/constants.js` (W1). No Three
  geometry building; it only drives the existing `renderer.camera`.

## Description

Cinematic camera language: a top-down-ish follow camera that eases toward the
snake head, keeps the arena framed, applies **event-driven shake** (subscribes
to the `shake` bus event), and reacts to water via the wobble tilt. Shake is
gated by `renderer.quality.followShake` (off on low). Uses a small impulse
spring so shakes feel organic and decay smoothly.

## Technical spec

```js
import * as THREE from 'three';
import { bus } from '../util/eventBus.js';

export class GameCamera {
  constructor(renderer) {
    this.r = renderer;
    this.base = new THREE.Vector3(0, GRID_H*0.9, GRID_H*0.75); // rest offset from target
    this.pos  = this.base.clone();
    this.target = new THREE.Vector3(0,0,0);
    // shake state
    this.shakeAmp = 0; this.shakePhase = 0;
    this._off = bus.on('shake', (p)=> this.applyShake((p&&p.power)||0)); // single subscriber
  }
  applyShake(power) { this.shakeAmp = Math.min(1, Math.max(this.shakeAmp, power)); }
  setTarget(x, z) { this.target.set(x, 0, z); }  // called each frame with head world pos
  update(dt, t) {
    // ease pos toward (target + base): pos += (target+base - pos) * (1-pow(k,dt))
    // shake: if quality.followShake, add jitter = sin(t*40)*shakeAmp*0.15 and
    //   cos(t*53)*shakeAmp*0.1 on x/z; decay shakeAmp *= pow(0.001, dt)
    // water wobble handled by snakeMesh (this stays stable); or optional small tilt.
    this.r.camera.position.copy(this.pos);
    this.r.camera.lookAt(this.target);
  }
  dispose() {}
}
```
- Follow: `GameCamera` targets the head world coords supplied each frame by the
  integration (`camera.setTo(headWorldX, headWorldZ)`). Keep a fixed offset
  `base` (top-down-ish) so the arena stays framed at any snake position.
- Ease factor frame-rate independent: `1 - Math.pow(0.0005, dt)`.
- Add a subtle "breathing" idle sway `sin(t*0.5)` at low amplitude for a
  living feel (skip on low tier).
- Clamp the target so the camera never looks beyond the arena walls
  (clamp `target` to `±(GRID/2)`).

## Acceptance criteria
- Moving the target makes the camera ease (not snap) to follow.
- `bus.emit('shake', {power:1})` produces visible jitter for ~0.5s then decays
  to rest; on `low` (followShake=false) there is no jitter.
- Larger `power` shakes harder but is clamped to amplitude 1.
- Camera never frames outside the arena edge (target clamped).
- No per-frame allocation in `update`.
