// js/world/walls.js — four arena wall boxes (T06, R-WORLD-03).
// Construction part (three). One shared material, no per-frame methods
// (R-PERF-04).
import * as THREE from 'three';
import { wallColor, FLOOR_SIZE } from './materials.js';

const THICKNESS = 0.4;
const HEIGHT = 0.5;
// Inner face 0.2 outside the arena edge: ±(FLOOR_SIZE/2 + 0.2) = ±10.2
// (contract values; centers then at ±10.4, length 20.8).
const INNER_GAP = 0.2;

/**
 * buildWalls() -> THREE.Group of exactly 4 wall boxes.
 * Two boxes at (±10.4, 0.25, 0) run along Z (0.4 × 0.5 × 20.8), two at
 * (0, 0.25, ±10.4) run along X (20.8 × 0.5 × 0.4); thickness 0.4, height
 * 0.5, inner faces at ±10.2 (R-WORLD-03 contract positions).
 * All four share one MeshStandardMaterial (wallColor, roughness 0.8,
 * envMapIntensity 0.4); castShadow and receiveShadow are true on each.
 */
export function buildWalls() {
  const inner = FLOOR_SIZE / 2 + INNER_GAP; // 10.2
  const center = inner + THICKNESS / 2; // 10.4
  const length = center * 2; // 20.8

  const material = new THREE.MeshStandardMaterial({
    color: wallColor,
    roughness: 0.8,
    envMapIntensity: 0.4,
  });
  // Boxes at x=±center run along Z; boxes at z=±center run along X.
  // Inner face = center - THICKNESS/2 = 10.2 (0.2 gap from floor edge).
  const geoAlongZ = new THREE.BoxGeometry(THICKNESS, HEIGHT, length);
  const geoAlongX = new THREE.BoxGeometry(length, HEIGHT, THICKNESS);

  const group = new THREE.Group();
  const specs = [
    [geoAlongZ, center, 0],
    [geoAlongZ, -center, 0],
    [geoAlongX, 0, center],
    [geoAlongX, 0, -center],
  ];
  for (const [geo, x, z] of specs) {
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set(x, HEIGHT / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}
