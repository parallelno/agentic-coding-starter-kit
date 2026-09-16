import * as THREE from 'three';
import { GRID } from '../config/constants.js';

/**
 * Arena: the static visuals of the play field — the ground ("table") the snake
 * plays on plus four low boundary walls framing the playable GRID.W x GRID.H
 * area. Everything is procedural (no external asset loads). The ground's top
 * surface sits at y = 0, centered on the origin; the walls rise just outside the
 * ±GRID.W/2 (X) and ±GRID.H/2 (Z) edges.
 */
export function createArena(renderer) {
  const g = new THREE.Group();
  g.add(makeGround());
  g.add(makeBounds(renderer));
  // renderer.add() -> scene.add(); scene.add() is a no-op if the object is
  // already a child, so this is safe to call even if re-invoked.
  renderer.add(g);
  return g;
}

function makeGround() {
  const geo = new THREE.PlaneGeometry(GRID.W, GRID.H);

  const mat = new THREE.MeshStandardMaterial({
    color: 0xcdbb93,          // warm neutral albedo
    map: makeGroundTexture(), // subtle procedural grain for slight variation
    roughness: 0.95,          // matte
    metalness: 0.0,
    emissive: 0x000000,       // no emissive
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(geo, mat);
  // PlaneGeometry faces +Z by default; rotate to face +Y so it reads as a
  // floor from the camera above. Centered at origin, top surface at y = 0.
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0;
  mesh.receiveShadow = true;
  mesh.name = 'arena-ground';
  return mesh;
}

/** Procedural 128x128 canvas texture: near-white with soft speckle so the
 *  albedo (material.color) still drives the base tint, adding only subtle
 *  per-pixel variation. Tiled a few times for a fine grain. */
function makeGroundTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  // Base near-white so material.color controls the warm neutral tone.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);

  // Soft low-contrast speckle for a paper-like matte variation.
  for (let i = 0; i < 2600; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = Math.random() * 1.6 + 0.3;
    const shade = Math.random() * 22 - 11; // -11..+11 around white
    const v = Math.max(0, Math.min(255, 255 + shade));
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 6);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeBounds(renderer) {
  const shadowsOn = renderer.quality.shadows.enabled;

  const height = 0.4;   // low boundary lip
  const thick = 0.3;    // wall thickness
  const halfY = height / 2; // bottom at y = 0, top at y = height

  const mat = new THREE.MeshStandardMaterial({
    color: 0x231f1a,    // dark accent
    roughness: 0.85,
    metalness: 0.05,
    emissive: 0x000000,
  });

  const group = new THREE.Group();
  group.name = 'arena-bounds';

  const xEdge = GRID.W / 2; // 10.5
  const zEdge = GRID.H / 2; // 10.5

  // E/W walls: run along Z, just outside ±xEdge in X.
  const ewGeo = new THREE.BoxGeometry(thick, height, GRID.H);
  for (const side of [-1, 1]) {
    const w = new THREE.Mesh(ewGeo, mat);
    w.position.set(side * (xEdge + thick / 2), halfY, 0);
    w.castShadow = shadowsOn;
    w.receiveShadow = true;
    group.add(w);
  }

  // N/S walls: run along X, just outside ±zEdge in Z. Length is extended by the
  // wall thickness on each end so they neatly cap the corners over the E/W walls.
  const nsGeo = new THREE.BoxGeometry(GRID.W + 2 * thick, height, thick);
  for (const side of [-1, 1]) {
    const w = new THREE.Mesh(nsGeo, mat);
    w.position.set(0, halfY, side * (zEdge + thick / 2));
    w.castShadow = shadowsOn;
    w.receiveShadow = true;
    group.add(w);
  }

  return group;
}
