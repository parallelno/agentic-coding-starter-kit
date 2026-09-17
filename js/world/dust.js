// js/world/dust.js — environmental dust field + pooled food-burst effects
// (T09, R-WORLD-06, R-PERF-04).
//
// `DustSystem`: a single THREE.Points of soft-blob sprites drifting slowly
// (down + lateral drift) inside a wrapping box. All buffers are preallocated
// at attach; updateDust integrates in place with zero allocation (R-PERF-04).
//
// `BurstSystem`: one pooled THREE.Points used to re-emit a small additive
// burst at an eaten-food cell. `emitBurst` re-arms all slots of a fixed pool;
// `updateBurst` integrates in place (small gravity) and fades via a
// preallocated per-vertex color attribute — no per-frame allocation.
//
// The per-index dust seed uses a deterministic mulberry32-style scramble by
// index (documented below) so the initial layout is reproducible. It is
// inlined here because R-ARCH-01 forbids importing js/providers from a world
// module (world may import only three, three/addons, and js/game/core.js).
//
// Imports: `three` and js/game/core.js only (R-ARCH-01; no engine/ui/input).
// No DOM access at import; the 2D canvas sprite is injectable (Node-safe).
import * as THREE from 'three';
import { cellToWorld } from '../game/core.js';

const TAU = Math.PI * 2;

// ---- Dust field box + motion (R-WORLD-06) --------------------------------
export const DUST_XZ_HALF = 12; // |x|,|z| wrap half-extent (world units)
export const DUST_Y_MIN = 0.2;
export const DUST_Y_MAX = 9.0;
export const DUST_VXZ_MAX = 0.15; // lateral drift magnitude (units/sec)
export const DUST_VY_MIN = -0.2; // downward (units/sec)
export const DUST_VY_MAX = -0.05;
export const DUST_SIZE = 0.14;
export const DUST_OPACITY = 0.35;
export const DUST_SPRITE_SIZE = 8; // 8x8 soft-blob canvas

// ---- Food-burst pool (R-WORLD-06) ----------------------------------------
export const BURST_POOL = 48;
export const BURST_LIFE = 0.6; // seconds
export const BURST_Y0 = 0.45; // spawn at the marker's base height
export const BURST_GRAVITY = 1.5; // small downward accel (units/sec^2)
export const BURST_SIZE = 0.12;
export const BURST_SPEED_MIN = 0.5;
export const BURST_SPEED_MAX = 1.4;
export const BURST_UP_MIN = 0.4;
export const BURST_UP_MAX = 1.2;

/**
 * perIndexRand(seed, i, k) -> [0, 1)
 * Deterministic per-(seed, index, component) hash, mulberry32-style.
 * Documented formula (the test oracle uses the same inputs for two
 * instances to prove identical initialization):
 *   h = (seed + i*0x9E3779B9 + k*0x85EBCA6B) mod 2^32
 *   h = (h ^ (h >>> 13)) * 1274126177 mod 2^32        (imul, >>>0)
 *   h ^= (h >>> 16)
 *   return h / 2^32
 */
function perIndexRand(seed, i, k) {
  let h = (seed + Math.imul(i, 0x9e3779b9) + Math.imul(k, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}

/**
 * toCtx(input) -> CanvasRenderingContext2D or a context-like object.
 * Guard mirrors js/world/environment.js: accept a 2D canvas or its 2D
 * context; otherwise throw so Node callers that omit it get a clear error
 * rather than a `document is not defined` at call time.
 */
function toCtx(input) {
  if (input && typeof input.createRadialGradient === 'function') return input;
  if (input && typeof input.getContext === 'function')
    return input.getContext('2d');
  throw new Error('makeDustSprite: inject a 2D canvas or its 2D context');
}

/**
 * makeDustSprite(canvasOrCtx) -> THREE.CanvasTexture
 * Draws an 8x8 soft radial-blob sprite (bright center fading to transparent)
 * onto an injected 2D context (mockable in Node), wrapped as a CanvasTexture.
 */
export function makeDustSprite(canvasOrCtx) {
  const ctx = toCtx(canvasOrCtx);
  const canvas =
    canvasOrCtx && typeof canvasOrCtx.getContext === 'function'
      ? canvasOrCtx
      : ctx.canvas;
  const s = DUST_SPRITE_SIZE;
  // A mock/ctx-only injection (Node) has no real backing canvas; skip the
  // resize then and hand a null image to CanvasTexture (three stores as-is).
  if (canvas && canvas.width !== s) {
    canvas.width = s;
    canvas.height = s;
  }
  const half = s / 2;
  const g = ctx.createRadialGradient(half, half, 0, half, half, half);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.6)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.clearRect(0, 0, s, s);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * DustSystem — one THREE.Points of drifting soft-blob particles.
 * - attach(scene, count=80, seed=1, {canvas}) -> this (keeps the Points on
 *   this.points for caller bookkeeping)
 * - updateDust(dtSec): in-place integrate + wrap. No allocation.
 * Public preallocated buffers (documented): this.positions (Float32Array,
 * count*3) and this.velocities (Float32Array, count*3). The position Buffer
 * Attribute wraps this.positions, so the public geometry position buffer and
 * this.positions refer to the SAME array.
 */
export class DustSystem {
  constructor(count = 80) {
    this.count = count;
    this.points = null;
    this.positions = null;
    this.velocities = null;
  }

  attach(scene, count = this.count, seed = 1, opts = {}) {
    this.count = count;
    const n3 = count * 3;
    this.positions = new Float32Array(n3);
    this.velocities = new Float32Array(n3);

    for (let i = 0; i < count; i++) {
      // deterministic layout: x,z in ±DUST_XZ_HALF; y in [Y_MIN, Y_MAX).
      const px = perIndexRand(seed, i, 0) * 2 - 1;
      const py = perIndexRand(seed, i, 1);
      const pz = perIndexRand(seed, i, 2) * 2 - 1;
      this.positions[i * 3 + 0] = px * DUST_XZ_HALF;
      this.positions[i * 3 + 1] =
        DUST_Y_MIN + py * (DUST_Y_MAX - DUST_Y_MIN);
      this.positions[i * 3 + 2] = pz * DUST_XZ_HALF;
      // lateral drift in ±DUST_VXZ_MAX; downward in [DUST_VY_MAX, DUST_VY_MIN].
      this.velocities[i * 3 + 0] =
        (perIndexRand(seed, i, 3) * 2 - 1) * DUST_VXZ_MAX;
      this.velocities[i * 3 + 1] =
        DUST_VY_MAX - perIndexRand(seed, i, 4) * (DUST_VY_MAX - DUST_VY_MIN);
      this.velocities[i * 3 + 2] =
        (perIndexRand(seed, i, 5) * 2 - 1) * DUST_VXZ_MAX;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));

    let map = null;
    if (opts && opts.canvas) map = makeDustSprite(opts.canvas);
    else if (typeof document !== 'undefined')
      map = makeDustSprite(document.createElement('canvas'));

    const mat = new THREE.PointsMaterial({
      size: DUST_SIZE,
      sizeAttenuation: true,
      transparent: true,
      opacity: DUST_OPACITY,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    if (map) mat.map = map;

    const points = new THREE.Points(geo, mat);
    scene.add(points);
    this.points = points;
    return this;
  }

  /**
   * updateDust(dtSec)
   * Integrate positions = positions + velocities*dt in place, then wrap:
   *   y < DUST_Y_MIN   -> y = DUST_Y_MAX
   *   |x| > DUST_XZ_HALF -> x = -sign(x) * DUST_XZ_HALF
   *   |z| > DUST_XZ_HALF -> z = -sign(z) * DUST_XZ_HALF
   * No allocation; writes only through this.positions / this.velocities.
   */
  updateDust(dt) {
    const p = this.positions;
    const v = this.velocities;
    const n = this.count;
    for (let i = 0; i < n; i++) {
      const i3 = i * 3;
      let x = p[i3] + v[i3] * dt;
      let y = p[i3 + 1] + v[i3 + 1] * dt;
      let z = p[i3 + 2] + v[i3 + 2] * dt;
      if (y < DUST_Y_MIN) y = DUST_Y_MAX;
      if (x > DUST_XZ_HALF) x = -DUST_XZ_HALF;
      else if (x < -DUST_XZ_HALF) x = DUST_XZ_HALF;
      if (z > DUST_XZ_HALF) z = -DUST_XZ_HALF;
      else if (z < -DUST_XZ_HALF) z = DUST_XZ_HALF;
      p[i3] = x;
      p[i3 + 1] = y;
      p[i3 + 2] = z;
    }
  }
}

/**
 * BurstSystem — one pooled THREE.Points reused for every food-eaten burst.
 * - attach(scene, poolSize=48) -> this (keeps the Points on this.points)
 * - emitBurst(c, r, rng): re-arm all poolSize slots at cellToWorld(c,r) at
 *   y0=BURST_Y0 with random outward+upward velocities from the injected rng,
 *   life=BURST_LIFE, points.visible=true.
 * - updateBurst(dtSec): gravity on vy, integrate, life-=dt; fade via
 *   the preallocated color attribute; when every slot is inactive, set
 *   points.visible=false. No allocation.
 */
export class BurstSystem {
  constructor(poolSize = BURST_POOL) {
    this.pool = poolSize;
    this.points = null;
    this.positions = null;
    this.velocities = null;
    this.life = null;
    this.colors = null;
  }

  attach(scene, poolSize = this.pool) {
    this.pool = poolSize;
    const n3 = poolSize * 3;
    this.positions = new Float32Array(n3);
    this.velocities = new Float32Array(n3);
    this.colors = new Float32Array(n3);
    this.life = new Float32Array(poolSize); // 0 while inactive

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));

    const mat = new THREE.PointsMaterial({
      size: BURST_SIZE,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      opacity: 1.0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const points = new THREE.Points(geo, mat);
    points.visible = false;
    scene.add(points);
    this.points = points;
    return this;
  }

  /**
   * emitBurst(c, r, rng)
   * Re-arm the whole pool: every slot placed at cellToWorld(c,r) at
   * y0=BURST_Y0, given a random outward (x,z) + upward (y) velocity from the
   * injected rng, life set to BURST_LIFE, color set to full white.
   * points.visible = true. No allocation.
   */
  emitBurst(c, r, rng) {
    const { x, z } = cellToWorld(c, r);
    for (let i = 0; i < this.pool; i++) {
      const i3 = i * 3;
      const a = rng() * TAU;
      const sp =
        BURST_SPEED_MIN + rng() * (BURST_SPEED_MAX - BURST_SPEED_MIN);
      const up = BURST_UP_MIN + rng() * (BURST_UP_MAX - BURST_UP_MIN);
      this.positions[i3 + 0] = x;
      this.positions[i3 + 1] = BURST_Y0;
      this.positions[i3 + 2] = z;
      this.velocities[i3 + 0] = Math.cos(a) * sp;
      this.velocities[i3 + 1] = up;
      this.velocities[i3 + 2] = Math.sin(a) * sp;
      this.life[i] = BURST_LIFE;
      this.colors[i3 + 0] = 1;
      this.colors[i3 + 1] = 1;
      this.colors[i3 + 2] = 1;
    }
    this.points.visible = true;
  }

  /**
   * updateBurst(dtSec)
   * For each active slot (life>0): vy -= BURST_GRAVITY*dt; pos += vel*dt;
   * life -= dt; if life <= 0 mark inactive (life=0, color black) else fade
   * color toward 0 in place. When no slot is active, points.visible=false.
   * No allocation.
   */
  updateBurst(dt) {
    const p = this.positions;
    const v = this.velocities;
    const col = this.colors;
    const life = this.life;
    let any = false;
    for (let i = 0; i < this.pool; i++) {
      if (life[i] <= 0) {
        col[i * 3 + 0] = 0;
        col[i * 3 + 1] = 0;
        col[i * 3 + 2] = 0;
        continue;
      }
      const i3 = i * 3;
      v[i3 + 1] -= BURST_GRAVITY * dt;
      p[i3 + 0] += v[i3 + 0] * dt;
      p[i3 + 1] += v[i3 + 1] * dt;
      p[i3 + 2] += v[i3 + 2] * dt;
      life[i] -= dt;
      if (life[i] <= 0) {
        life[i] = 0;
        col[i3 + 0] = 0;
        col[i3 + 1] = 0;
        col[i3 + 2] = 0;
      } else {
        any = true;
        const f = Math.min(1, life[i] / BURST_LIFE);
        col[i3 + 0] = f;
        col[i3 + 1] = f;
        col[i3 + 2] = f;
      }
    }
    if (!any) this.points.visible = false;
  }
}

/** Default export: convenience factory for the ambient dust field. */
export function createDust(count = 80, seed = 1) {
  return new DustSystem(count);
}

export default { DustSystem, BurstSystem, createDust };
