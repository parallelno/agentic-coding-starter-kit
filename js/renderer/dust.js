import * as THREE from 'three';

// Dust specks float above the arena. Their home X/Z is kept in preallocated base
// arrays so per-frame sway is a pure function of time (no drift, no allocation).
const HALF = 10.5;    // arena half-extent (matches GRID 21 x CELL 1.0)
const TOP = 6;        // top of the vertical wrap band (Y world units)
const TAU = Math.PI * 2;
const SWAY = 0.15;    // lateral sway amplitude
const SWAY_SPEED = 0.3; // angular frequency of the sway

export class Dust {
  constructor(renderer) {
    this.renderer = renderer;
    this.count = 0;
    this.points = null;
    this.positions = null; // Float32Array(3*count): live X/Y/Z
    this.speeds = null;    // Float32Array(count): per-particle upward drift (units/sec)
    this.phases = null;    // Float32Array(count): sway phase
    this.basePos = null;   // Float32Array(2*count): home X/Z for sway reference
    this.makeTexture();
    this.rebuild();
  }

  makeTexture() {
    // 32x32 white radial-gradient dot with soft alpha falloff -> soft speck.
    const SIZE = 32;
    const cvs = document.createElement('canvas');
    cvs.width = SIZE;
    cvs.height = SIZE;
    const ctx = cvs.getContext('2d');
    const g = ctx.createRadialGradient(SIZE / 2, SIZE / 2, 0, SIZE / 2, SIZE / 2, SIZE / 2);
    g.addColorStop(0.0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.6)');
    g.addColorStop(1.0, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, SIZE, SIZE);

    this.texture = new THREE.CanvasTexture(cvs);
    this.texture.needsUpdate = true;
    return this.texture;
  }

  setQuality(name) {
    // Tier switch entry point. renderer.quality already reflects the active
    // tier (the Renderer re-applies it before we're called); just rebuild.
    void name;
    this.rebuild();
  }

  rebuild() {
    // Tear down the previous particle set (and its GPU resources) before rebuild.
    if (this.points) {
      this.points.geometry.dispose();
      this.points.material.dispose();
      this.renderer.remove(this.points);
      this.points = null;
    }

    const count = Math.max(0, Math.round(this.renderer.quality.dustCount));
    if (count === 0) {
      this.count = 0;
      this.positions = null;
      this.speeds = null;
      this.phases = null;
      this.basePos = null;
      return;
    }

    this.positions = new Float32Array(count * 3);
    this.speeds = new Float32Array(count);
    this.phases = new Float32Array(count);
    this.basePos = new Float32Array(count * 2);

    for (let i = 0; i < count; i++) {
      const x = (Math.random() * 2 - 1) * HALF;    // -10.5..10.5
      const z = (Math.random() * 2 - 1) * HALF;    // -10.5..10.5
      const y = Math.random() * TOP;               // 0..6
      this.positions[i * 3] = x;
      this.positions[i * 3 + 1] = y;
      this.positions[i * 3 + 2] = z;
      this.basePos[i * 2] = x;
      this.basePos[i * 2 + 1] = z;
      this.speeds[i] = 0.1 + Math.random() * 0.4;  // 0.1..0.5 units/sec
      this.phases[i] = Math.random() * TAU;        // 0..2PI
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.05,
      map: this.texture,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.renderer.add(this.points);
    this.count = count;
  }

  update(dt, t) {
    if (!this.points || this.count === 0) return;
    const pos = this.positions;
    const base = this.basePos;
    const speeds = this.speeds;
    const phases = this.phases;

    for (let i = 0; i < this.count; i++) {
      const i3 = i * 3;
      const i2 = i * 2;
      let y = pos[i3 + 1] + dt * speeds[i];
      if (y > TOP) y -= TOP;                       // wrap to bottom of the band
      pos[i3 + 1] = y;
      // Lateral sway is a pure function of time around the home X/Z.
      pos[i3] = base[i2] + Math.sin(t * SWAY_SPEED + phases[i]) * SWAY;
      pos[i3 + 2] = base[i2 + 1] + Math.sin(t * SWAY_SPEED + phases[i] + 1.0) * SWAY;
    }

    // Write the mutated buffer back to the GPU.
    this.points.geometry.attributes.position.needsUpdate = true;
  }

  dispose() {
    if (this.points) {
      this.points.geometry.dispose();
      this.points.material.dispose();
      this.renderer.remove(this.points);
      this.points = null;
    }
    if (this.texture) {
      this.texture.dispose();
      this.texture = null;
    }
    this.count = 0;
  }
}
