import * as THREE from 'three';
import { WATER_OFFSET_Y, WATER_WOBBLE, CENTER } from '../config/constants.js';
import { manhattan, toWorld } from '../game/grid.js';
import { bus } from '../util/eventBus.js';

// Water quads sit just above the arena floor and are inset slightly per cell so
// a thin grout line remains visible between neighbouring tiles.
const CELL = 0.95; // 1.0 (GRID.CELL) - 0.05 grout gap

// A single shared water body: a center-east oval pond plus a vertical stream.
// Returns a Set of "col,row" strings; cells within manhattan <= 1 of CENTER are
// excluded so the snake never starts in water.
function waterCellSet() {
  const set = new Set();
  // Grid: 21 cols (0..20), 21 rows (0..20). Oval center at (5,5), a=3, b=2.
  // The stream: a vertical band at col 14-16, rows 8-13.
  for (let row = 0; row < 21; row++) for (let col = 0; col < 21; col++) {
    let water = false;
    const nx = (col - 5) / 3, ny = (row - 5) / 2;
    if (nx * nx + ny * ny <= 1) water = true;            // oval
    if (col >= 14 && col <= 16 && row >= 8 && row <= 13) water = true; // stream
    if (!water) continue;
    if (manhattan({ col, row }, CENTER) <= 1) continue;   // keep center clear
    set.add(`${col},${row}`);
  }
  return set;
}

// Small procedural normal map (single shared texture, not per-quad). Built from
// integer-frequency sinusoid waves so it tiles seamlessly under RepeatWrapping.
// `density` (derived from quality.waterSegments) scales normal strength so higher
// tiers read as more turbulent water. All data is synthetic - no external files.
function makeAnimatedNormalTexture(segments) {
  const SIZE = 128;
  const density = Math.min(2, Math.max(0.5, (segments || 32) / 32)); // 0.5..2

  // Height field from waves whose frequencies are integer multiples of one cycle
  // across the texture, giving a seamless tile when RepeatWrapping is applied.
  const h = new Float32Array(SIZE * SIZE);
  const TAU = Math.PI * 2;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const u = (x / SIZE) * TAU;
      const v = (y / SIZE) * TAU;
      let s = 0;
      s += 1.0 * Math.sin(u * 2 + 1.3) * Math.cos(v * 2);
      s += 0.5 * Math.sin(u * 5) * Math.cos(v * 4 + 0.7);
      s += 0.25 * Math.sin(u * 9 + 0.4) * Math.cos(v * 9);
      h[y * SIZE + x] = s;
    }
  }

  // Finite-difference gradient -> tangent-space normals (wrap indices tile too).
  const strength = WATER_WOBBLE * 4 * density;
  const data = new Uint8Array(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    const ym = ((y - 1 + SIZE) % SIZE) * SIZE;
    const yp = ((y + 1) % SIZE) * SIZE;
    for (let x = 0; x < SIZE; x++) {
      const xm = y * SIZE + ((x - 1 + SIZE) % SIZE);
      const xp = y * SIZE + ((x + 1) % SIZE);
      let nxv = (h[xm] - h[xp]) * strength;
      let nyv = (h[ym + x] - h[yp + x]) * strength;
      let nzv = 1.0;
      const len = Math.hypot(nxv, nyv, nzv) || 1;
      nxv /= len; nyv /= len; nzv /= len;
      const i = (y * SIZE + x) * 4;
      data[i] = (nxv * 0.5 + 0.5) * 255;
      data[i + 1] = (nyv * 0.5 + 0.5) * 255;
      data[i + 2] = (nzv * 0.5 + 0.5) * 255;
      data[i + 3] = 255;
    }
  }

  const tex = new THREE.DataTexture(data, SIZE, SIZE, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.NoColorSpace; // raw normal data, not sRGB
  tex.needsUpdate = true;
  return tex;
}

export class Water {
  constructor(renderer) {
    this.renderer = renderer;
    this.cells = waterCellSet();
    this.group = new THREE.Group();

    this.material = new THREE.MeshStandardMaterial({
      color: 0x2f7fae,
      transparent: true,
      opacity: 0.85,
      roughness: 0.05,
      metalness: 0.0,
    });
    this.material.normalScale = new THREE.Vector2(WATER_WOBBLE, WATER_WOBBLE);

    this.buildMeshes(renderer.quality.waterSegments);

    this.normalTex = makeAnimatedNormalTexture(renderer.quality.waterSegments);
    this.material.normalMap = this.normalTex;

    renderer.add(this.group);
    this.lastEntry = null; // last (col,row) flagged, to avoid duplicate entry
  }

  // One flat quad per water cell, all sharing a single geometry + material.
  buildMeshes(_segments) {
    // Rebuild guard: tear down any previous quads/geometry before adding new ones.
    if (this._quadGeometry) {
      this._quadGeometry.dispose();
      for (const child of this.group.children) this.group.remove(child);
    }

    const geo = new THREE.PlaneGeometry(CELL, CELL);
    geo.rotateX(-Math.PI / 2); // faces +Y (flat on the floor)
    this._quadGeometry = geo;

    for (const key of this.cells) {
      const [col, row] = key.split(',').map(Number);
      const { x, z } = toWorld(col, row);
      const mesh = new THREE.Mesh(geo, this.material);
      mesh.position.set(x, WATER_OFFSET_Y, z);
      mesh.receiveShadow = false;
      mesh.castShadow = false;
      this.group.add(mesh);
    }
  }

  isWater(col, row) { return this.cells.has(`${col},${row}`); }
  key(col, row)     { return `${col},${row}`; }

  // Fire once per fresh entry into a water cell (splash sfx + tiny shake).
  markHeadWater(col, row) {
    if (this.lastEntry === this.key(col, row)) return;
    this.lastEntry = this.key(col, row);
    bus.emit('sfx', { name: 'splash' });
    bus.emit('shake', { power: 0.15 });
  }

  // Scroll the shared normal-map offset over time (offset-only, no per-frame alloc).
  update(dt, _t) {
    if (this.normalTex) {
      this.normalTex.offset.x += dt * 0.02;
      this.normalTex.offset.y -= dt * 0.01;
    }
  }

  dispose() {
    if (this.normalTex) this.normalTex.dispose();
    if (this.material) this.material.dispose();
    if (this._quadGeometry) this._quadGeometry.dispose();
    this.renderer.remove(this.group);
  }
}

export function buildWaterCells() { return waterCellSet(); } // convenience for unit tests
