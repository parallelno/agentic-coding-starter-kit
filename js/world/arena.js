import * as THREE from 'three';
import { GRID, COLORS, POND } from '../config.js';
import { cellToWorld } from '../core/game.js';

/**
 * Placeholder arena for M1 (visual identity + PBR props arrive in M2/M3).
 * Gray floor + perimeter fence + a visible pond disc + a static boulder prop.
 */
export function buildArena(scene) {
  const group = new THREE.Group();
  group.name = 'arena';

  const size = GRID.N * GRID.CELL;

  // Floor (grid plate)
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(size, 0.2, size),
    new THREE.MeshLambertMaterial({ color: 0x9a938a })
  );
  floor.position.y = -0.1;
  floor.receiveShadow = true;
  group.add(floor);

  // Grid lines (single LineSegments, cheap)
  const pts = [];
  for (let i = 0; i <= GRID.N; i++) {
    const c = -size / 2 + i;
    pts.push(c, 0.01, -size / 2, c, 0.01, size / 2);
    pts.push(-size / 2, 0.01, c, size / 2, 0.01, c);
  }
  const gridGeo = new THREE.BufferGeometry();
  gridGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const grid = new THREE.LineSegments(
    gridGeo,
    new THREE.LineBasicMaterial({ color: 0x7d766d, transparent: true, opacity: 0.5 })
  );
  group.add(grid);

  // Perimeter fence: 4 boxes
  const wallMat = new THREE.MeshLambertMaterial({ color: COLORS.WALL });
  const t = 0.5, h = 1.2;
  for (const [w, d, x, z] of [
    [size + t * 2, t, 0, -size / 2 - t / 2],
    [size + t * 2, t, 0, size / 2 + t / 2],
    [t, size + t * 2, -size / 2 - t / 2, 0],
    [t, size + t * 2, size / 2 + t / 2, 0]
  ]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
    wall.position.set(x, h / 2 - 0.2, z);
    wall.castShadow = true;
    wall.receiveShadow = true;
    group.add(wall);
  }

  // Pond placeholder: dark blue disc at POND.CENTER (real water in M2/M3)
  const pondPos = cellToWorld(POND.CENTER);
  const pond = new THREE.Mesh(
    new THREE.CylinderGeometry(POND.RADIUS_CELLS * GRID.CELL, POND.RADIUS_CELLS * GRID.CELL, 0.06, 40),
    new THREE.MeshLambertMaterial({ color: 0x1d5d8c })
  );
  pond.position.set(pondPos.x, 0.03, pondPos.z);
  pond.name = 'pond';
  group.add(pond);

  // Static prop (obstacle) outside the playfield — placeholder for CC0 boulder (M2)
  const boulder = new THREE.Mesh(
    new THREE.DodecahedronGeometry(1.4, 0),
    new THREE.MeshLambertMaterial({ color: 0x6f6a63 })
  );
  boulder.position.set(size / 2 + 3, 0.6, size / 2 + 3);
  boulder.rotation.set(0.3, 0.8, 0.1);
  boulder.castShadow = true;
  boulder.name = 'boulder';
  group.add(boulder);

  scene.add(group);
  return group;
}