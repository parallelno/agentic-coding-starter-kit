// ClothView — three.js view of ClothSim. Owns the geometry/material and syncs sim state into
// the buffers each frame. Never keeps a second copy of the vertex positions (R3/C1).
//
// Hidden-vertex note: R3 words the degenerate target as `HIDDEN = vertCount-1`, but index
// vertCount-1 is a real cloth vertex (the bottom-right corner). Task 03's contract resolves this
// by appending one extra vertex at index `vertCount`, positioned at the cloth centre, which is
// what this class does: geometry vertex count = sim.vertCount + 1, HIDDEN = sim.vertCount.
import * as THREE from 'three';
import { CLOTH_H, CLOTH_Y, DRY_RGB, MATERIAL_BASE, WET_RGB } from '../config.js';

function isTorn(source, springIndex) {
  if (!source) return false;
  return typeof source.has === 'function' ? source.has(springIndex) : source[springIndex] !== 0;
}

// Builds the quad table: corner indices plus the 4 structural springs that bound each quad.
export function buildQuadTable(sim) {
  const cols = sim.cols;
  const rows = sim.rows;
  const quadCount = (cols - 1) * (rows - 1);
  const lookup = new Map();
  for (let k = 0; k < sim.springCount; k++) lookup.set(sim.springs.a[k] * sim.vertCount + sim.springs.b[k], k);
  const springOf = (i, j) => lookup.get(Math.min(i, j) * sim.vertCount + Math.max(i, j));

  const corners = new Int32Array(quadCount * 4);
  const edges = new Int32Array(quadCount * 4);
  const baseIndices = new Uint16Array(quadCount * 6);
  let q = 0;
  for (let r = 0; r + 1 < rows; r++) {
    for (let c = 0; c + 1 < cols; c++, q++) {
      const i0 = r * cols + c;
      const i1 = i0 + 1;
      const i2 = (r + 1) * cols + c;
      const i3 = i2 + 1;
      corners[q * 4] = i0;
      corners[q * 4 + 1] = i1;
      corners[q * 4 + 2] = i2;
      corners[q * 4 + 3] = i3;
      edges[q * 4] = springOf(i0, i1); // top
      edges[q * 4 + 1] = springOf(i2, i3); // bottom
      edges[q * 4 + 2] = springOf(i0, i2); // left
      edges[q * 4 + 3] = springOf(i1, i3); // right
      baseIndices[q * 6] = i0;
      baseIndices[q * 6 + 1] = i1;
      baseIndices[q * 6 + 2] = i3;
      baseIndices[q * 6 + 3] = i0;
      baseIndices[q * 6 + 4] = i3;
      baseIndices[q * 6 + 5] = i2;
    }
  }
  return { quadCount, corners, edges, baseIndices };
}

// Pure index patcher (Node-testable, no three.js): a quad with any torn boundary spring has all
// six of its indices rewritten to the hidden vertex, so no triangle references its corners.
export function patchTornIndices(indexArray, table, tornSprings, hidden) {
  const { quadCount, edges, baseIndices } = table;
  let hiddenQuads = 0;
  for (let q = 0; q < quadCount; q++) {
    let hide = false;
    for (let e = 0; e < 4; e++) {
      if (isTorn(tornSprings, edges[q * 4 + e])) {
        hide = true;
        break;
      }
    }
    const o = q * 6;
    if (hide) {
      hiddenQuads++;
      for (let k = 0; k < 6; k++) indexArray[o + k] = hidden;
    } else {
      for (let k = 0; k < 6; k++) indexArray[o + k] = baseIndices[o + k];
    }
  }
  return hiddenQuads;
}

export class ClothView {
  constructor(sim) {
    this.sim = sim;
    this.hidden = sim.vertCount;
    const vertexTotal = sim.vertCount + 1;

    const positions = new Float32Array(vertexTotal * 3);
    positions.set(sim.positions);
    positions[this.hidden * 3] = 0;
    positions[this.hidden * 3 + 1] = CLOTH_Y - CLOTH_H / 2;
    positions[this.hidden * 3 + 2] = 0;

    const colors = new Float32Array(vertexTotal * 3);
    for (let i = 0; i < vertexTotal; i++) {
      colors[i * 3] = DRY_RGB[0];
      colors[i * 3 + 1] = DRY_RGB[1];
      colors[i * 3 + 2] = DRY_RGB[2];
    }
    colors[this.hidden * 3] = WET_RGB[0];
    colors[this.hidden * 3 + 1] = WET_RGB[1];
    colors[this.hidden * 3 + 2] = WET_RGB[2];

    this.table = buildQuadTable(sim);
    this._indexArray = Uint16Array.from(this.table.baseIndices);
    this._hiddenState = new Uint8Array(this.table.quadCount);
    this._hiddenQuads = 0;

    const geometry = new THREE.BufferGeometry();
    const positionAttribute = new THREE.BufferAttribute(positions, 3);
    positionAttribute.setUsage(THREE.DynamicDrawUsage);
    const colorAttribute = new THREE.BufferAttribute(colors, 3);
    colorAttribute.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('position', positionAttribute);
    geometry.setAttribute('color', colorAttribute);
    geometry.setIndex(new THREE.BufferAttribute(this._indexArray, 1));

    const material = new THREE.MeshStandardMaterial({
      color: MATERIAL_BASE,
      side: THREE.DoubleSide,
      roughness: 0.9,
      metalness: 0.0,
      vertexColors: true,
    });

    this._mesh = new THREE.Mesh(geometry, material);
    this._mesh.name = 'cloth';
    this._geometry = geometry;
    this._material = material;

    // Per-vertex color updater. Task 07 owns js/world/wetness.js; until main.js injects the real
    // `updateWetnessColors` (wave 7), sync() falls back to the pure dry fill. Kept as an injected
    // function so this module never has to import a file that may not exist (a dynamic import of a
    // missing module would log a 404, breaking N3).
    this.colorUpdater = null;
  }

  setColorUpdater(fn) {
    this.colorUpdater = typeof fn === 'function' ? fn : null;
  }

  get mesh() {
    return this._mesh;
  }

  get geometry() {
    return this._geometry;
  }

  get material() {
    return this._material;
  }

  get hiddenQuadCount() {
    return this._hiddenQuads;
  }

  // Per-frame sim -> geometry sync: positions, vertex colors, torn-quad index patching, normals.
  sync() {
    const sim = this.sim;
    const positionAttribute = this._geometry.getAttribute('position');
    positionAttribute.array.set(sim.positions);
    positionAttribute.needsUpdate = true;

    if (this.colorUpdater) {
      this.colorUpdater(this._geometry, sim);
    } else {
      const colorAttribute = this._geometry.getAttribute('color');
      const colors = colorAttribute.array;
      for (let i = 0; i < sim.vertCount; i++) {
        colors[i * 3] = DRY_RGB[0];
        colors[i * 3 + 1] = DRY_RGB[1];
        colors[i * 3 + 2] = DRY_RGB[2];
      }
      colorAttribute.needsUpdate = true;
    }

    this._syncTornIndices();
    this._geometry.computeVertexNormals();
  }

  _syncTornIndices() {
    const { quadCount, edges } = this.table;
    const torn = this.sim.springs.torn;
    let changed = false;
    let hiddenQuads = this._hiddenQuads;
    for (let q = 0; q < quadCount; q++) {
      let hide = false;
      for (let e = 0; e < 4; e++) {
        if (torn[edges[q * 4 + e]] !== 0) {
          hide = true;
          break;
        }
      }
      if (hide === (this._hiddenState[q] === 1)) continue;
      this._hiddenState[q] = hide ? 1 : 0;
      hiddenQuads += hide ? 1 : -1;
      const o = q * 6;
      if (hide) {
        for (let k = 0; k < 6; k++) this._indexArray[o + k] = this.hidden;
      } else {
        for (let k = 0; k < 6; k++) this._indexArray[o + k] = this.table.baseIndices[o + k];
      }
      changed = true;
    }
    if (changed) {
      this._hiddenQuads = hiddenQuads;
      this._geometry.getIndex().needsUpdate = true;
    }
  }
}