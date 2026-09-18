/**
 * Fixed-timestep logic + per-frame rendering.
 *
 * Usage:
 *   const loop = new Loop({ stepMs: 125 });
 *   loop.start((dt) => {
 *     if (running) loop.advance(dt, speedMul); // 0..n logic steps
 *     render(dt);
 *   });
 */
export class Loop {
  /**
 * @param {{ stepMs: number, onStep?: () => void }} opts
 * The fixed-step logic callback (`onStep`) runs once per consumed step.
 */
  constructor({ stepMs, onStep, maxStepMs = 100 }) {
    this.stepMs = stepMs;   // base logic interval (1 move per interval at 1x)
    this.onStep = onStep ?? (() => {});
    this.maxStepMs = maxStepMs; // spiral-of-death guard
    this._accMs = 0;
    this._last = null;
  }

  /**
   * @param {(dt: number, loop: Loop) => void} onFrame called every rAF, before the next render
   */
  start(onFrame) {
    const tick = (t) => {
      if (this._last === null) this._last = t;
      let dt = (t - this._last) / 1000;
      this._last = t;
      if (dt > this.maxStepMs / 1000) dt = this.maxStepMs / 1000;
      onFrame(dt, this);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  /**
   * Advance the logic accumulator by dt * speedMul and run as many
   * fixed steps as fit. @returns number of steps executed this frame.
   * @param {number} dt seconds
   * @param {number} speedMul moves per base interval (1 at base speed)
   */
  advance(dt, speedMul = 1) {
    this._accMs += dt * 1000 * speedMul;
    if (this._accMs < 0) this._accMs = 0; // clamp drift after a big speed change
    let maxSteps = Math.ceil((this.maxStepMs / this.stepMs) * Math.max(speedMul, 1)) + 1;
    let n = 0;
    while (this._accMs >= this.stepMs && n++ < maxSteps) {
      this._accMs -= this.stepMs;
      this.onStep();
    }
    if (this._accMs > 0 && n >= maxSteps) this._accMs = 0; // spiral guard: drop remainder
    return n;
  }

  /**
   * Fraction 0..1 of the way through the current logic step — use it to lerp
   * between the previous and current state for constant-velocity rendering
   * (decouples the discrete step rate from the render rate).
   */
  get alpha() {
    return Math.min(1, this._accMs / this.stepMs);
  }
}