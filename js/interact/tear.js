// Tearing pass (R4): a spring whose effective strain exceeds TEAR_STRAIN is marked torn.
// Pure module (no three.js) so the threshold/cascade behaviour is unit-testable in Node.
//
// s_eff = strain(k) + gain * avg(water impulse magnitudes on the spring's endpoints)
// Runs once per substep AFTER sim.step(); a tear therefore takes effect on the next substep,
// which matches R4's "marked torn on the next substep" wording.
import { TEAR_STRAIN, WATER_TEAR_GAIN } from '../config.js';

export function tearPass(sim, waterImpulseMagnitudes = null, gain = WATER_TEAR_GAIN) {
  const { a, b, torn } = sim.springs;
  let tornThisPass = 0;
  for (let k = 0; k < a.length; k++) {
    if (torn[k] !== 0) continue;
    let strain = sim.strain(k);
    if (waterImpulseMagnitudes) {
      const magA = waterImpulseMagnitudes[a[k]] || 0;
      const magB = waterImpulseMagnitudes[b[k]] || 0;
      strain += gain * ((magA + magB) * 0.5);
    }
    if (strain > TEAR_STRAIN) {
      sim.markTorn(k);
      tornThisPass++;
    }
  }
  return tornThisPass;
}