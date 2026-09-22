// Water hose (R5): camera-mounted nozzle, 900 particles/s ring buffer, cloth impulse + wetness.
//
// The simulation core (emission/integration/hit test) is pure JS with pre-allocated typed arrays
// so it is unit-testable in Node with a mock sim and provably allocation-free in the hot loop
// (N2). The three.js layer (nozzle meshes + THREE.Points) only calls into that core.
//
// Jitter: sum-of-two-uniforms (Irwin-Hall n=2, triangular) scaled so the standard deviation is
// exactly WATER_JITTER; chosen over Box-Muller because it needs no trig/log and no allocation.
import * as THREE from 'three';
import {
  GRAVITY,
  HIT_R,
  IMPULSE_K,
  NOZZLE_COLOR,
  NOZZLE_OFFSET,
  NOZZLE_PITCH,
  PARTICLE_COLOR,
  PARTICLE_OPACITY,
  PARTICLE_SIZE,
  RATE,
  WATER_GRID_COLS,
  WATER_GRID_ROWS,
  WATER_JITTER,
  WATER_LIFE,
  WATER_MAX,
  WATER_SPEED,
  WET_ABSORB_PER_HIT,
} from '../config.js';

const JITTER_RANGE = (WATER_JITTER * Math.sqrt(6)) / 2; // sd of sum of 2 uniforms in [-a,a] = 2a/sqrt(6)
const KILL_Y = -1e6; // dead slots are parked far below the floor (documented cull trick)

export function createCore(vertCount) {
  const cells = WATER_GRID_COLS * WATER_GRID_ROWS;
  return {
    vertCount,
    max: WATER_MAX,
    pos: new Float32Array(WATER_MAX * 3),
    vel: new Float32Array(WATER_MAX * 3),
    life: new Float32Array(WATER_MAX),
    write: 0,
    spawnAcc: 0,
    spawned: 0,
    impulsesThisFrame: new Float32Array(vertCount),
    impulseMagnitudes: new Float32Array(vertCount),
    gridCols: WATER_GRID_COLS,
    gridRows: WATER_GRID_ROWS,
    cellStarts: new Int32Array(cells + 1),
    cellCounts: new Int32Array(cells),
    cellItems: new Int32Array(vertCount),
    cellCursor: new Int32Array(cells),
    gridMinX: 0,
    gridMinY: 0,
    gridSizeX: 1,
    gridSizeY: 1,
    hits: 0,
    live: 0,
  };
}

// Spawns RATE*dt particles (fractional spawns carried across calls) from `origin` along `dir`.
export function emissionCore(core, dt, origin, dir) {
  core.spawnAcc += RATE * dt;
  let count = Math.floor(core.spawnAcc);
  if (count <= 0) return 0;
  core.spawnAcc -= count;
  if (count > core.max) count = core.max;
  for (let s = 0; s < count; s++) {
    const i = core.write;
    core.write = (core.write + 1) % core.max;
    const o = i * 3;
    const jx = (Math.random() + Math.random() - 1) * JITTER_RANGE;
    const jy = (Math.random() + Math.random() - 1) * JITTER_RANGE;
    const jz = (Math.random() + Math.random() - 1) * JITTER_RANGE;
    core.pos[o] = origin.x;
    core.pos[o + 1] = origin.y;
    core.pos[o + 2] = origin.z;
    core.vel[o] = dir.x * WATER_SPEED + jx;
    core.vel[o + 1] = dir.y * WATER_SPEED + jy;
    core.vel[o + 2] = dir.z * WATER_SPEED + jz;
    core.life[i] = WATER_LIFE;
    core.spawned++;
  }
  return count;
}

function cellOf(core, x, y) {
  let cx = Math.floor((x - core.gridMinX) / core.gridSizeX);
  let cy = Math.floor((y - core.gridMinY) / core.gridSizeY);
  if (cx < 0) cx = 0;
  if (cy < 0) cy = 0;
  if (cx >= core.gridCols) cx = core.gridCols - 1;
  if (cy >= core.gridRows) cy = core.gridRows - 1;
  return cy * core.gridCols + cx;
}

// Rebuilds the coarse vertex grid over the cloth AABB (once per frame, pre-allocated).
export function buildGrid(core, sim) {
  const vertCount = sim.vertCount;
  const pos = sim.positions;
  if (vertCount === 0) {
    // No cloth vertices (used by the pure tests): keep the grid well-defined so cell lookups
    // simply find nothing.
    core.gridMinX = 0;
    core.gridMinY = 0;
    core.gridSizeX = 1;
    core.gridSizeY = 1;
    core.cellCounts.fill(0);
    core.cellStarts.fill(0);
    return;
  }
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < vertCount; i++) {
    const o = i * 3;
    const x = pos[o];
    const y = pos[o + 1];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  if (!(maxX - minX > 1e-4)) maxX = minX + 1e-4;
  if (!(maxY - minY > 1e-4)) maxY = minY + 1e-4;
  // Pad the AABB by HIT_R and floor the cell size at HIT_R: that guarantees the 3x3 cell
  // neighbourhood of any particle covers at least HIT_R in every direction, so a vertex within
  // HIT_R is always found even when the cloth collapses into a small (or degenerate) AABB.
  core.gridMinX = minX - HIT_R;
  core.gridMinY = minY - HIT_R;
  core.gridSizeX = Math.max((maxX - minX + 2 * HIT_R) / core.gridCols, HIT_R);
  core.gridSizeY = Math.max((maxY - minY + 2 * HIT_R) / core.gridRows, HIT_R);

  core.cellCounts.fill(0);
  for (let i = 0; i < vertCount; i++) {
    core.cellCounts[cellOf(core, pos[i * 3], pos[i * 3 + 1])]++;
  }
  let acc = 0;
  for (let c = 0; c < core.cellCounts.length; c++) {
    core.cellStarts[c] = acc;
    core.cellCursor[c] = acc;
    acc += core.cellCounts[c];
  }
  core.cellStarts[core.cellCounts.length] = acc;
  for (let i = 0; i < vertCount; i++) {
    const cell = cellOf(core, pos[i * 3], pos[i * 3 + 1]);
    core.cellItems[core.cellCursor[cell]++] = i;
  }
}

// Closest vertex to (x, y, z) within HIT_R, searching the particle's cell and its 8 neighbours
// (HIT_R is smaller than a cell, so a hit near a cell border can belong to a neighbouring cell).
function closestVertex(core, sim, x, y, z) {
  const cols = core.gridCols;
  const rows = core.gridRows;
  let cx = Math.floor((x - core.gridMinX) / core.gridSizeX);
  let cy = Math.floor((y - core.gridMinY) / core.gridSizeY);
  if (cx < 0) cx = 0;
  if (cy < 0) cy = 0;
  if (cx >= cols) cx = cols - 1;
  if (cy >= rows) cy = rows - 1;

  const p = sim.positions;
  let best = -1;
  let bestD2 = HIT_R * HIT_R;
  for (let gy = Math.max(0, cy - 1); gy <= Math.min(rows - 1, cy + 1); gy++) {
    for (let gx = Math.max(0, cx - 1); gx <= Math.min(cols - 1, cx + 1); gx++) {
      const cell = gy * cols + gx;
      const end = core.cellStarts[cell + 1];
      for (let s = core.cellStarts[cell]; s < end; s++) {
        const v = core.cellItems[s];
        const o = v * 3;
        const dx = p[o] - x;
        const dy = p[o + 1] - y;
        const dz = p[o + 2] - z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 <= bestD2) {
          bestD2 = d2;
          best = v;
        }
      }
    }
  }
  return best;
}
// Integrate all live particles and resolve cloth hits. Kills particles at the floor (y < 0) or on
// hit; on hit the cloth receives exactly one impulse and one wetness deposit (R5).
export function stepCore(core, sim, dt) {
  buildGrid(core, sim);
  core.hits = 0;
  let live = 0;
  const { pos, vel, life } = core;
  for (let i = 0; i < core.max; i++) {
    if (life[i] <= 0) continue;
    const o = i * 3;
    vel[o + 1] += GRAVITY * dt;
    pos[o] += vel[o] * dt;
    pos[o + 1] += vel[o + 1] * dt;
    pos[o + 2] += vel[o + 2] * dt;
    life[i] -= dt;
    if (life[i] <= 0 || pos[o + 1] < 0) {
      life[i] = 0;
      continue;
    }
    const hit = closestVertex(core, sim, pos[o], pos[o + 1], pos[o + 2]);
    if (hit >= 0) {
      sim.applyImpulse(hit, vel[o] * dt * IMPULSE_K, vel[o + 1] * dt * IMPULSE_K, vel[o + 2] * dt * IMPULSE_K);
      sim.addWetness(hit, WET_ABSORB_PER_HIT);
      life[i] = 0;
      core.hits++;
      continue;
    }
    live++;
  }
  core.live = live;
  return { live, hits: core.hits };
}

// Copies the cloth's impulse buffer into this frame's magnitudes and zeroes the accumulator.
// `substeps` converts frame-level magnitudes into per-substep values for tearPass (the Task 06
// hand-off, wired in js/main.js).
export function drainImpulseCore(core, sim, substeps = 1) {
  const drained = sim.drainImpulseMagnitudes();
  const inv = 1 / Math.max(1, substeps);
  for (let i = 0; i < core.vertCount; i++) core.impulseMagnitudes[i] = drained[i] * inv;
  return core.impulseMagnitudes;
}

// Writes particle positions for the Points geometry; dead slots are parked at KILL_Y.
export function writePointPositions(core, positionsArray) {
  for (let i = 0; i < core.max; i++) {
    const o = i * 3;
    if (core.life[i] > 0) {
      positionsArray[o] = core.pos[o];
      positionsArray[o + 1] = core.pos[o + 1];
      positionsArray[o + 2] = core.pos[o + 2];
    } else {
      positionsArray[o] = 0;
      positionsArray[o + 1] = KILL_Y;
      positionsArray[o + 2] = 0;
    }
  }
}

export class WaterHose {
  constructor(camera, sim, scene) {
    this.camera = camera;
    this.sim = sim;
    this.scene = scene;
    this.core = createCore(sim.vertCount);
    this.active = false;

    // Nozzle: cosmetic cylinder + torus parented to the camera, pointing forward-down 20 degrees.
    const nozzleMaterial = new THREE.MeshStandardMaterial({ color: NOZZLE_COLOR, roughness: 0.6, metalness: 0.15 });
    const nozzle = new THREE.Group();
    nozzle.name = 'nozzle';
    nozzle.position.set(NOZZLE_OFFSET[0], NOZZLE_OFFSET[1], NOZZLE_OFFSET[2]);
    // Nozzle points forward-down: the camera looks along -Z, so a negative rotation about X
    // tilts the local -Z axis downwards by NOZZLE_PITCH (the opposite sign points it up).
    nozzle.rotation.x = -NOZZLE_PITCH;
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.18, 12), nozzleMaterial);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.z = -0.09;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.042, 0.012, 8, 16), nozzleMaterial);
    ring.position.z = -0.02;
    nozzle.add(barrel, ring);
    this.nozzle = nozzle;
    camera.add(nozzle);
    // Camera children only render when the camera is part of the scene graph.
    scene.add(camera);

    this._pointArray = new Float32Array(WATER_MAX * 3);
    this._pointArray.fill(KILL_Y);
    const geometry = new THREE.BufferGeometry();
    const attribute = new THREE.BufferAttribute(this._pointArray, 3);
    attribute.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('position', attribute);
    const material = new THREE.PointsMaterial({
      size: PARTICLE_SIZE,
      sizeAttenuation: true,
      color: PARTICLE_COLOR,
      transparent: true,
      opacity: PARTICLE_OPACITY,
    });
    this.points = new THREE.Points(geometry, material);
    this.points.name = 'water';
    this.points.frustumCulled = false;
    scene.add(this.points);

    this._origin = new THREE.Vector3();
    this._dir = new THREE.Vector3();
    this._quat = new THREE.Quaternion();
  }

  get impulseMagnitudes() {
    return this.core.impulseMagnitudes;
  }

  get liveCount() {
    return this.core.live;
  }

  get spawnCount() {
    return this.core.spawned;
  }

  setActive(active) {
    this.active = Boolean(active);
    if (!this.active) this.core.spawnAcc = 0; // releasing stops the stream within one frame
  }

  nozzleTip(out = new THREE.Vector3()) {
    return this.nozzle.localToWorld(out.set(0, 0, -0.1));
  }

  update(dt, substeps = 1) {
    if (this.active) {
      this.nozzleTip(this._origin);
      this.nozzle.getWorldQuaternion(this._quat);
      this._dir.set(0, 0, -1).applyQuaternion(this._quat);
      emissionCore(this.core, dt, this._origin, this._dir);
    }
    stepCore(this.core, this.sim, dt);
    drainImpulseCore(this.core, this.sim, substeps);
    writePointPositions(this.core, this._pointArray);
    this.points.geometry.getAttribute('position').needsUpdate = true;
  }
}