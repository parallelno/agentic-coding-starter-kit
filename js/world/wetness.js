// View-side wetness colouring (R6/C4). Pure JS over typed arrays: no three.js import, so it is
// Node-testable with a stub geometry. The sim owns `wet`; this only writes the color attribute.
import { DRY_RGB, WET_RGB } from '../config.js';

export function updateWetnessColors(geo, sim, dry = DRY_RGB, wet = WET_RGB) {
  const attribute = typeof geo.getAttribute === 'function' ? geo.getAttribute('color') : geo.color;
  if (!attribute) return null;
  const colors = attribute.array;
  const w = sim.wet;
  const dr = dry[0];
  const dg = dry[1];
  const db = dry[2];
  const wr = wet[0] - dr;
  const wg = wet[1] - dg;
  const wb = wet[2] - db;
  for (let i = 0; i < sim.vertCount; i++) {
    const t = w[i];
    const o = i * 3;
    colors[o] = dr + wr * t;
    colors[o + 1] = dg + wg * t;
    colors[o + 2] = db + wb * t;
  }
  attribute.needsUpdate = true;
  return colors;
}