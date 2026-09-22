// ClothSim — pure JS mass-spring (Verlet) cloth. No three.js, no DOM: importable in Node.
// Contract: specs/cloth-simulator/requirements.md (R2/R4/R6/C2) and tasks/task-02-cloth-sim-core.md.
//
// Layout note: row 0 (the TOP row) lies at CLOTH_Y, then the two pinned vertices are moved to
// PINNED_POS (y = 2.2). That offset leaves ~0.29 m of slack in the top edge (material length
// 2.29 m across a 2.0 m pin span), which is what makes the sheet sag into a drape on load.
// Rest lengths are measured from THAT initial state, so a fresh cloth starts at zero strain
// (otherwise the corner springs would start at ~226% strain and tear themselves on step 1).
import {
  CLOTH_H,
  CLOTH_W,
  CLOTH_Y,
  COLS,
  DAMPING,
  GRAVITY,
  JITTER,
  N_CONSTRAINTS,
  PINNED_IDS,
  PINNED_POS,
  ROWS,
  WET_DIFFUSE,
  WET_GRAVITY_GAIN,
} from '../config.js';

export class ClothSim {
  constructor() {
    this.cols = COLS;
    this.rows = ROWS;
    this.vertCount = COLS * ROWS;

    this.positions = new Float32Array(this.vertCount * 3);
    this.prev = new Float32Array(this.vertCount * 3);
    this.wet = new Float32Array(this.vertCount);
    this.invMass = new Float32Array(this.vertCount).fill(1);
    for (const id of PINNED_IDS) this.invMass[id] = 0;

    // Impulse bookkeeping for the tear/water path (Task 05/06). `_impulse` accumulates the
    // magnitude of impulses applied since the last drain; `_impulseOut` is the drained copy
    // handed to the caller so the accumulator can be zeroed immediately.
    this._impulse = new Float32Array(this.vertCount);
    this._impulseOut = new Float32Array(this.vertCount);

    // Single-slot temporary pin (Task 04 grab).
    this._pinIndex = -1;
    this._pinX = 0;
    this._pinY = 0;
    this._pinZ = 0;

    // Ring-neighbour lookup: 4 slots per vertex [right, left, down, up] with the structural
    // spring index for that edge (-1 when the edge does not exist).
    this._ringVertex = new Int32Array(this.vertCount * 4).fill(-1);
    this._ringSpring = new Int32Array(this.vertCount * 4).fill(-1);
    this._springMap = new Map();

    this._buildSprings();
    this._buildLayout();
  }

  // --- Construction ---------------------------------------------------------

  _pushSpring(list, i, j) {
    if (i === j) return;
    const lo = i < j ? i : j;
    const hi = i < j ? j : i;
    list.push(lo, hi);
  }

  _buildSprings() {
    const { cols, rows } = this;
    // Order matters for reproducibility only: structural, then shear, then bend (task 02).
    const pairs = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        if (c + 1 < cols) this._pushSpring(pairs, i, i + 1);
        if (r + 1 < rows) this._pushSpring(pairs, i, i + cols);
      }
    }
    this.structuralCount = pairs.length / 2;
    for (let r = 0; r + 1 < rows; r++) {
      for (let c = 0; c + 1 < cols; c++) {
        const i = r * cols + c;
        this._pushSpring(pairs, i, i + cols + 1);
        this._pushSpring(pairs, i + 1, i + cols);
      }
    }
    this.shearCount = pairs.length / 2 - this.structuralCount;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        if (c + 2 < cols) this._pushSpring(pairs, i, i + 2);
        if (r + 2 < rows) this._pushSpring(pairs, i, i + 2 * cols);
      }
    }

    const count = pairs.length / 2;
    this.springCount = count;
    const a = new Int32Array(count);
    const b = new Int32Array(count);
    const rest = new Float32Array(count);
    const torn = new Uint8Array(count);
    for (let k = 0; k < count; k++) {
      a[k] = pairs[k * 2];
      b[k] = pairs[k * 2 + 1];
      this._springMap.set(a[k] * this.vertCount + b[k], k);
    }
    this.springs = { a, b, rest, torn };

    this._fillRingTables();
  }

  _fillRingTables() {
    const { cols, rows } = this;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const slots = [
          [0, 1, c + 1 < cols, r, c + 1], // right
          [0, -1, c - 1 >= 0, r, c - 1], // left
          [1, 0, r + 1 < rows, r + 1, c], // down
          [-1, 0, r - 1 >= 0, r - 1, c], // up
        ];
        for (let s = 0; s < 4; s++) {
          if (!slots[s][2]) continue;
          const n = slots[s][3] * cols + slots[s][4];
          this._ringVertex[i * 4 + s] = n;
          this._ringSpring[i * 4 + s] = this._springMap.get(Math.min(i, n) * this.vertCount + Math.max(i, n));
        }
      }
    }
  }

  // Positions every vertex on the flat vertical plane, jitters z, pins the two top corners,
  // then measures rest lengths from the resulting initial state.
  _buildLayout() {
    const { cols, rows, positions, prev } = this;
    const dx = CLOTH_W / (cols - 1);
    const dy = CLOTH_H / (rows - 1);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const o = i * 3;
        positions[o] = -CLOTH_W / 2 + c * dx;
        positions[o + 1] = CLOTH_Y - r * dy;
        positions[o + 2] = (Math.random() * 2 - 1) * JITTER;
      }
    }
    for (let p = 0; p < PINNED_IDS.length; p++) {
      const id = PINNED_IDS[p];
      const o = id * 3;
      positions[o] = PINNED_POS[p][0];
      positions[o + 1] = PINNED_POS[p][1];
      positions[o + 2] = PINNED_POS[p][2];
    }
    prev.set(positions);

    const { a, b, rest } = this.springs;
    for (let k = 0; k < rest.length; k++) {
      const oa = a[k] * 3;
      const ob = b[k] * 3;
      const ex = positions[ob] - positions[oa];
      const ey = positions[ob + 1] - positions[oa + 1];
      const ez = positions[ob + 2] - positions[oa + 2];
      rest[k] = Math.sqrt(ex * ex + ey * ey + ez * ez);
    }
  }

  // --- Simulation -----------------------------------------------------------

  // One Verlet substep: re-pin, integrate, damp, then N Gauss-Seidel constraint passes.
  // No allocations: all state is pre-allocated in the constructor.
  step(dt) {
    const { positions, prev, wet, invMass, vertCount } = this;
    const { a, b, rest, torn } = this.springs;
    const dt2 = dt * dt;
    const pinIndex = this._pinIndex;

    for (let i = 0; i < vertCount; i++) {
      const o = i * 3;
      if (invMass[i] === 0) {
        // Pinned corners are overwritten with PINNED_POS every step and never integrate.
        const p = PINNED_IDS[0] === i ? 0 : 1;
        positions[o] = PINNED_POS[p][0];
        positions[o + 1] = PINNED_POS[p][1];
        positions[o + 2] = PINNED_POS[p][2];
        prev[o] = positions[o];
        prev[o + 1] = positions[o + 1];
        prev[o + 2] = positions[o + 2];
        continue;
      }
      if (i === pinIndex) {
        // Temp pin (Task 04 grab): held at the target instead of integrating, with prev
        // kept equal to the position so releasing produces no rocket-jet.
        positions[o] = this._pinX;
        positions[o + 1] = this._pinY;
        positions[o + 2] = this._pinZ;
        prev[o] = this._pinX;
        prev[o + 1] = this._pinY;
        prev[o + 2] = this._pinZ;
        continue;
      }

      const ox = positions[o];
      const oy = positions[o + 1];
      const oz = positions[o + 2];
      const ay = GRAVITY * (1 + WET_GRAVITY_GAIN * wet[i]);

      // Verlet with 98% velocity retention (R2). Written as
      //   xNew = x + (1 - DAMPING) * (x - pPrev) + a*dt^2,   pPrev = x
      // instead of `pPrev = lerp(pPrev, x, DAMPING)` on the stored history: that lerp form has
      // characteristic root (2 - DAMPING) and grows exponentially (velocity doubles per substep,
      // NaN by ~step 150). Both express "velocity retained at 98%", this one is stable.
      const retain = 1 - DAMPING;
      const vx = (ox - prev[o]) * retain;
      const vy = (oy - prev[o + 1]) * retain;
      const vz = (oz - prev[o + 2]) * retain;

      prev[o] = ox;
      prev[o + 1] = oy;
      prev[o + 2] = oz;

      positions[o] = ox + vx;
      positions[o + 1] = oy + vy + ay * dt2;
      positions[o + 2] = oz + vz;
    }

    for (let pass = 0; pass < N_CONSTRAINTS; pass++) {
      for (let k = 0; k < a.length; k++) {
        if (torn[k] !== 0) continue;
        const ia = a[k];
        const ib = b[k];
        const wa = ia === pinIndex ? 0 : invMass[ia];
        const wb = ib === pinIndex ? 0 : invMass[ib];
        const wsum = wa + wb;
        if (wsum === 0) continue;

        const oa = ia * 3;
        const ob = ib * 3;
        let dx = positions[ob] - positions[oa];
        let dy = positions[ob + 1] - positions[oa + 1];
        let dz = positions[ob + 2] - positions[oa + 2];
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist === 0) continue;

        const diff = (dist - rest[k]) / dist;
        const fa = (wa / wsum) * diff;
        const fb = (wb / wsum) * diff;
        positions[oa] += dx * fa;
        positions[oa + 1] += dy * fa;
        positions[oa + 2] += dz * fa;
        positions[ob] -= dx * fb;
        positions[ob + 1] -= dy * fb;
        positions[ob + 2] -= dz * fb;
      }
    }
  }

  applyImpulse(i, dx, dy, dz) {
    if (this.invMass[i] === 0) return;
    const o = i * 3;
    this.positions[o] += dx;
    this.positions[o + 1] += dy;
    this.positions[o + 2] += dz;
    this._impulse[i] += Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  // Returns the magnitudes of the impulses applied since the last call and zeroes the
  // accumulator. The returned array is reused between calls: read it before draining again.
  drainImpulseMagnitudes() {
    this._impulseOut.set(this._impulse);
    this._impulse.fill(0);
    return this._impulseOut;
  }

  addWetness(i, amount) {
    const { wet, invMass } = this;
    wet[i] = Math.min(1, wet[i] + amount);
    const spread = amount * WET_DIFFUSE;
    const base = i * 4;
    for (let s = 0; s < 4; s++) {
      const n = this._ringVertex[base + s];
      if (n === -1) continue;
      if (invMass[n] === 0) continue; // pinned vertices never absorb
      if (this.springs.torn[this._ringSpring[base + s]] !== 0) continue; // torn edge blocks water
      wet[n] = Math.min(1, wet[n] + spread);
    }
  }

  strain(k) {
    const { positions } = this;
    const oa = this.springs.a[k] * 3;
    const ob = this.springs.b[k] * 3;
    const dx = positions[ob] - positions[oa];
    const dy = positions[ob + 1] - positions[oa + 1];
    const dz = positions[ob + 2] - positions[oa + 2];
    return (Math.sqrt(dx * dx + dy * dy + dz * dz) - this.springs.rest[k]) / this.springs.rest[k];
  }

  markTorn(k) {
    this.springs.torn[k] = 1;
  }

  setTempPin(i, x, y, z) {
    this._pinIndex = i;
    this._pinX = x;
    this._pinY = y;
    this._pinZ = z;
  }

  clearTempPin() {
    this._pinIndex = -1;
  }

  // Fresh cloth: new jitter, cleared torn/wet/impulse/temp-pin state.
  reset() {
    this.springs.torn.fill(0);
    this.wet.fill(0);
    this._impulse.fill(0);
    this._impulseOut.fill(0);
    this.clearTempPin();
    this._buildLayout();
  }

  get tornCount() {
    let n = 0;
    for (let k = 0; k < this.springs.torn.length; k++) n += this.springs.torn[k];
    return n;
  }

  get wetMax() {
    let m = 0;
    for (let i = 0; i < this.wet.length; i++) if (this.wet[i] > m) m = this.wet[i];
    return m;
  }

  get tempPinIndex() {
    return this._pinIndex;
  }
}