// js/world/floor.js — procedural sand arena floor (T06, R-WORLD-03).
// `floorTexturePixels` is pure Node-testable math; `buildFloor` is the
// construction part (DOM + three). No per-frame methods (R-PERF-04).
import * as THREE from 'three';
import { FLOOR_SIZE, sandAlbedo } from './materials.js';

export const TEXTURE_SIZE = 512;

/**
 * floorTexturePixels(size = 512) -> Float32Array of size*size*3 in [0, 1].
 * Pixel (i, j) samples sandAlbedo at the world-space point
 *   x = (i + 0.5) / size * FLOOR_SIZE - FLOOR_SIZE / 2
 *   z = (j + 0.5) / size * FLOOR_SIZE - FLOOR_SIZE / 2
 * (pixel centers; the floor spans [-FLOOR_SIZE/2, FLOOR_SIZE/2]^2 and each
 * sandAlbedo cell is 1 world unit, i.e. a 1:1 map of the GRID*TILE arena).
 */
export function floorTexturePixels(size = TEXTURE_SIZE) {
  const px = new Float32Array(size * size * 3);
  const half = FLOOR_SIZE / 2;
  const step = FLOOR_SIZE / size;
  let o = 0;
  for (let j = 0; j < size; j++) {
    const z = (j + 0.5) * step - half;
    for (let i = 0; i < size; i++) {
      const x = (i + 0.5) * step - half;
      const a = sandAlbedo(x, z);
      px[o] = a.r;
      px[o + 1] = a.g;
      px[o + 2] = a.b;
      o += 3;
    }
  }
  return px;
}

/**
 * buildFloor(renderer) -> THREE.Mesh
 * Plane(FLOOR_SIZE, FLOOR_SIZE), MeshStandardMaterial
 * ({ map: CanvasTexture(floorTexturePixels), roughness 0.92, metalness 0.02,
 *   envMapIntensity 0.5 }), rotated -90° X, receiveShadow.
 * The renderer (optional) only supplies maxAnisotropy for the texture.
 */
export function buildFloor(renderer) {
  const size = TEXTURE_SIZE;
  const px = floorTexturePixels(size);

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let k = 0; k < px.length; k++) {
    img.data[k] = Math.round(px[k] * 255);
  }
  for (let i = 3; i < img.data.length; i += 4) {
    img.data[i] = 255;
  }
  ctx.putImageData(img, 0, 0);

  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  if (renderer && renderer.capabilities) {
    map.anisotropy = renderer.capabilities.maxAnisotropy ?? 1;
  }

  const material = new THREE.MeshStandardMaterial({
    map,
    roughness: 0.92,
    metalness: 0.02,
    envMapIntensity: 0.5,
  });
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(FLOOR_SIZE, FLOOR_SIZE),
    material
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.receiveShadow = true;
  return mesh;
}
