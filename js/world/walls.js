// Four arena boundary walls (R-WORLD-03). Construction-only, no per-frame work
// (R-PERF-04). One shared material instance for all four boxes.

import * as THREE from 'three';
import { wallColor } from './materials.js';

const THICKNESS = 0.4;
const HEIGHT = 0.5;
// Inner face at +-10.2 (grid half-extent 9.5 + 0.7 visual margin); box centers
// sit 0.2 (half thickness) further out at +-10.4. Length 20.8 spans both caps.
const CENTER = 10.4;
const LENGTH = 20.8;
const Y = HEIGHT / 2;

/**
 * buildWalls() -> THREE.Group with exactly 4 boxes sharing one material
 * (MeshStandardMaterial, wallColor, roughness 0.8, envMapIntensity 0.4;
 * castShadow + receiveShadow true).
 */
export function buildWalls() {
  const group = new THREE.Group();
  group.name = 'walls';

  const geo = new THREE.BoxGeometry(LENGTH, HEIGHT, THICKNESS);
  const mat = new THREE.MeshStandardMaterial({
    color: wallColor,
    roughness: 0.8,
    metalness: 0.0,
    envMapIntensity: 0.4,
  });

  const positions = [
    { pos: [CENTER, Y, 0], rot: Math.PI / 2 }, // +X wall: long axis -> Z
    { pos: [-CENTER, Y, 0], rot: Math.PI / 2 }, // -X wall
    { pos: [0, Y, CENTER], rot: 0 }, // +Z wall: long axis -> X
    { pos: [0, Y, -CENTER], rot: 0 }, // -Z wall
  ];

  for (const p of positions) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(p.pos[0], p.pos[1], p.pos[2]);
    m.rotation.y = p.rot;
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
  }

  return group;
}
