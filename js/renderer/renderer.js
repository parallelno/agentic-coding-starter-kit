import * as THREE from 'three';
import { QUALITY_TIERS, detectQuality } from '../config/quality.js';
import { GRID } from '../config/constants.js';

const SKY_COLOR = 0x0a0e1a;
const SUN_COLOR = 0xfff4e0;
const SUN_POSITION = new THREE.Vector3(8, 20, 6);
// Ortho bounds for the sun shadow camera, sized to cover the whole arena with
// a little margin.
const SHADOW_BOUNDS = (GRID.W / 2) * 1.2;

export class Renderer {
  constructor(canvas) {
    this.tier = detectQuality();

    // --- Scene: dark cinematic sky + subtle depth fog ---
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(SKY_COLOR);
    this.scene.fog = new THREE.FogExp2(SKY_COLOR, 0.025);

    // --- Camera: top-down-ish view, slight elevation, framed on arena center ---
    const canvasAspect =
      canvas && canvas.clientWidth && canvas.clientHeight
        ? canvas.clientWidth / canvas.clientHeight
        : 16 / 9;
    this.camera = new THREE.PerspectiveCamera(50, canvasAspect, 0.1, 100);
    this.camera.position.set(0, GRID.H * 0.9, GRID.H * 0.75);
    this.camera.lookAt(0, 0, 0);

    // --- Renderer ---
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });

    // --- Sun: single directional light, castShadow, aimed at arena center ---
    this.sun = new THREE.DirectionalLight(SUN_COLOR, 1.0);
    this.sun.position.copy(SUN_POSITION);
    this.sun.castShadow = true;
    this.sun.target.position.set(0, 0, 0);
    const shadowCam = this.sun.shadow.camera;
    shadowCam.left = -SHADOW_BOUNDS;
    shadowCam.right = SHADOW_BOUNDS;
    shadowCam.top = SHADOW_BOUNDS;
    shadowCam.bottom = -SHADOW_BOUNDS;
    shadowCam.near = 0.5;
    shadowCam.far = 60;
    shadowCam.updateProjectionMatrix();
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    // --- Hemi fill: base light from sky above and ground below ---
    this.hemi = new THREE.HemisphereLight(0x445577, 0x0a0505, 0.5);
    this.scene.add(this.hemi);

    this.applyQuality(this.tier);
  }

  applyQuality(tierName) {
    const q = QUALITY_TIERS[tierName];
    this.tier = tierName;
    this.renderer.setPixelRatio(q.pixelRatio);
    this.renderer.shadowMap.enabled = q.shadows.enabled;
    this.renderer.shadowMap.autoUpdate = q.shadows.enabled;
    if (q.shadows.enabled) {
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      // Refresh the sun's shadow map size for this tier.
      this.sun.shadow.mapSize.set(q.shadows.mapSize, q.shadows.mapSize);
    }
  }

  setTier(tierName) {
    this.applyQuality(tierName);
  }

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
    let w = canvas && canvas.clientWidth;
    let h = canvas && canvas.clientHeight;
    if (!w || !h) {
      w = window.innerWidth || 1;
      h = window.innerHeight || 1;
    }
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
