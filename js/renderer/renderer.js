import * as THREE from 'three';
import { QUALITY_TIERS, detectQuality } from '../config/quality.js';
import { GRID } from '../config/constants.js';

// Arena half-extent (world units). Grid is GRID.W x GRID.H cells of size CELL.
const ARENA_HALF = (GRID.W / 2) * GRID.CELL; // 10.5 for a 21-wide grid
const SHADOW_MARGIN = 2.0;                 // breathing room so shadows reach the rim
const SKY_COLOR = 0x8fb4d8;                // cool cinematic sky
const FOG_COLOR = 0x87a8cc;                // slightly cooler than the sky for depth

export class Renderer {
  constructor(canvas) {
    this.tier = detectQuality();

    this.scene = new THREE.Scene();
    // Cinematic depth: a soft sky background plus subtle exponential-free (linear) fog
    // that fades distant arena edges into the horizon.
    this.scene.background = new THREE.Color(SKY_COLOR);
    this.scene.fog = new THREE.Fog(FOG_COLOR, GRID.H * 0.6, GRID.H * 3.0);

    const w = Math.max(1, canvas.clientWidth);
    const h = Math.max(1, canvas.clientHeight);
    this.camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 100);
    // Frame the arena from a high, three-quarter angle for a cinematic top-down tilt.
    this.camera.position.set(0, GRID.H * 0.9, GRID.H * 0.75);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // start sizing before we know the tier; applyQuality will re-tune pixel ratio.

    // "Sun": a single warm-white DirectionalLight, casting soft PCF shadows,
    // aimed at the arena origin. One shadow source keeps the shadow pass cheap.
    this.sun = new THREE.DirectionalLight(0xfff2d8, 1.4);
    this.sun.position.set(8, 20, 6);
    this.sun.target.position.set(0, 0, 0);
    this.sun.castShadow = true;
    this._configureSunShadowCamera();
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    // Low ambient/hemi fill so shadowed areas keep base color and read against the sky.
    this.ambient = new THREE.HemisphereLight(0xbcd6ff, 0x3a3320, 0.55);
    this.scene.add(this.ambient);

    this.resize();
    this.applyQuality(this.tier);
  }

  /**
   * Size the sun's orthographic shadow frustum so it comfortably covers the arena.
   * Bounds are symmetric around the arena center (the light target), with a margin.
   */
  _configureSunShadowCamera() {
    const cam = this.sun.shadow.camera;
    const bound = ARENA_HALF + SHADOW_MARGIN;
    cam.left = -bound;
    cam.right = bound;
    cam.top = bound;
    cam.bottom = -bound;
    // The light sits well above the arena; these bounds comfortably contain
    // the frustum corners so no shadow is clipped at the arena rim.
    cam.near = 0.5;
    cam.far = 60;
    cam.updateProjectionMatrix();
  }

  /**
   * Apply a quality tier's renderer settings. Idempotent — safe to call on init
   * and on every tier switch.
   */
  applyQuality(tierName) {
    const q = QUALITY_TIERS[tierName];
    this.tier = tierName;

    this.renderer.setPixelRatio(q.pixelRatio);
    this.renderer.shadowMap.enabled = q.shadows.enabled;   // off for low
    this.renderer.shadowMap.autoUpdate = q.shadows.enabled; // off for low

    // Only retune the shadow camera size when it actually changes so we don't
    // needlessly force a reallocation on every call.
    const size = q.shadows.mapSize;
    if (this.sun.shadow.mapSize.x !== size) {
      // Tearing down the existing map so the next render reallocates at the new size.
      if (this.sun.shadow.map) {
        this.sun.shadow.map.dispose();
        this.sun.shadow.map = null;
      }
      this.sun.shadow.mapSize.set(size, size);
    }
    this.sun.castShadow = q.shadows.enabled;
  }

  /** Tier switch entry point (called by the HUD toggle). Re-applies settings and resizes. */
  setTier(tierName) {
    this.applyQuality(tierName);
    this.resize();
  }

  /** The active quality-tier descriptor (shadows, dust, water, post, shake, ...). */
  get quality() {
    return QUALITY_TIERS[this.tier];
  }

  add(obj) {
    this.scene.add(obj);
  }

  remove(obj) {
    this.scene.remove(obj);
  }

  resize() {
    const canvas = this.renderer.domElement;
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /**
   * Draw one frame. Superseded by the post-processing composer (task-13); until
   * then this is the sole render path. Avoids per-frame allocation.
   */
  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
