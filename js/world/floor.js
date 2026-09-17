// Procedural sandbox floor (R-WORLD-03, R-PERF-04).
//
// `floorTexturePixels(size)` is pure + Node-testable and returns the exact
// per-pixel sandAlbedo values. `buildFloor` constructs the actual PBR mesh.

import * as THREE from 'three';
import { sandAlbedo, FLOOR_SIZE } from './materials.js';
import { GRID } from '../game/core.js';

/**
 * floorTexturePixels(size = 512) -> Float32Array of length size*size*3 (RGBA
 * layout is not needed; we return R,G,B triplets, one per pixel, in row-major
 * order). Row 0 is the top of the texture. Cell coordinates for pixel (x, y)
 * are ((x+0.5)/size)*GRID and ((y+0.5)/size)*GRID so interior texels sample
 * cell centers while texels landing near x%1==0 or y%1==0 pick up the grid
 * line (factor 0.94).
 */
export function floorTexturePixels(size = 512) {
  const out = new Float32Array(size * size * 3);
  for (let y = 0; y < size; y++) {
    const r = ((y + 0.5) / size) * GRID;
    for (let x = 0; x < size; x++) {
      const c = ((x + 0.5) / size) * GRID;
      const a = sandAlbedo(c, r);
      const i = (y * size + x) * 3;
      out[i] = a.r;
      out[i + 1] = a.g;
      out[i + 2] = a.b;
    }
  }
  return out;
}

/**
 * buildFloor() -> THREE.Mesh of a FLOOR_SIZE x FLOOR_SIZE plane rotated -90deg
 * on X (facing +Y), receiving shadow, with MeshStandardMaterial:
 * map = CanvasTexture from floorTexturePixels, roughness 0.92, metalness 0.02,
 * envMapIntensity 0.5.
 *
 * The canvas is built lazily from a 2D context; under Node we fall back to a
 * minimal canvas shim so tests can inspect the material/geometry without a GL
 * context.
 */
export function buildFloor() {
  const size = 256; // texture resolution for the mesh (pixels, not units)
  const px = floorTexturePixels(size);
  const canvas = makeCanvas(size, px);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;

  const geo = new THREE.PlaneGeometry(FLOOR_SIZE, FLOOR_SIZE);
  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    roughness: 0.92,
    metalness: 0.02,
    envMapIntensity: 0.5,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.receiveShadow = true;
  return mesh;
}

// Best-effort 2D canvas creation; works in browsers. Under Node (no DOM) we
// build a minimal canvas-like object so three accepts a textureImage.
function makeCanvas(size, px) {
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(size, size);
    for (let i = 0; i < px.length; i += 3) {
      img.data[i] = Math.round(px[i] * 255);
      img.data[i + 1] = Math.round(px[i + 1] * 255);
      img.data[i + 2] = Math.round(px[i + 2] * 255);
      img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }
  // Node shim: three only reads width/height at upload time (browser), so a
  // plain object is enough for construction + material inspection.
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < px.length; i += 3) {
    const j = (i / 3) * 4;
    data[j] = Math.round(px[i] * 255);
    data[j + 1] = Math.round(px[i + 1] * 255);
    data[j + 2] = Math.round(px[i + 2] * 255);
    data[j + 3] = 255;
  }
  return { width: size, height: size, _data: data };
}
