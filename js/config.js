// Shared constants for the cloth simulator.
// Single source of truth for every number named in specs/cloth-simulator/requirements.md.
// No imports: this module must stay Node- and browser-importable on its own.

// --- Simulation (R2 / C2) ---
export const GRAVITY = -9.8;
export const DT_SUB = 1 / 120;
export const DT_SUB_MAX = 5;
export const DT_CLAMP = 0.05;
export const N_CONSTRAINTS = 6;
export const DAMPING = 0.02; // pPrev = lerp(pPrev, p, DAMPING) => 98% velocity retained
export const JITTER = 0.005; // |z| jitter on the initial flat cloth (< 0.005 m)

// --- Cloth geometry (R1 / C2) ---
export const COLS = 32;
export const ROWS = 24;
export const CLOTH_W = 2.0;
export const CLOTH_H = 1.5;
export const CLOTH_Y = 2.0; // row 0 (top row) sits at this y before settling
export const PINNED_POS = [
  [-1.0, 2.2, 0],
  [1.0, 2.2, 0],
];
export const PINNED_IDS = [0, COLS - 1]; // top-left and top-right of row 0

// --- Tearing (R4) ---
export const TEAR_STRAIN = 0.35;
export const WATER_TEAR_GAIN = 0.05;

// --- Wetness (R6 / C4) ---
export const WET_DIFFUSE = 0.25;
export const WET_GRAVITY_GAIN = 1.5; // a_y = GRAVITY * (1 + WET_GRAVITY_GAIN * w)
export const DRY_RGB = [0.96, 0.96, 0.94];
export const WET_RGB = [0.35, 0.42, 0.55];

// --- Water hose (R5) ---
export const RATE = 900;
export const WATER_SPEED = 6.5;
export const WATER_LIFE = 1.5;
export const WATER_JITTER = 0.25;
export const WATER_MAX = 1024;
export const IMPULSE_K = 0.35;
export const HIT_R = 0.06;
export const WET_ABSORB_PER_HIT = 0.02;
export const WATER_GRID_COLS = 12;
export const WATER_GRID_ROWS = 9;
export const PARTICLE_RADIUS = 0.008;
export const PARTICLE_SIZE = 0.03;
export const PARTICLE_COLOR = 0x9fd0ff;
export const PARTICLE_OPACITY = 0.85;
export const NOZZLE_OFFSET = [0.30, -0.22, -0.55];
export const NOZZLE_PITCH = Math.PI / 9; // 20 degrees, forward-down
export const NOZZLE_COLOR = 0x1e2126;

// --- Rendering / environment (R1 / R3) ---
export const MATERIAL_BASE = 0xf5f4ef;
export const SKY_COLOR = 0xbcd0e0;
export const FLOOR_SIZE = 12;
export const FLOOR_COLOR = 0x8a8f96;

// --- Camera (R7) ---
export const CAM_FOV = 50;
export const CAM_NEAR = 0.1;
export const CAM_FAR = 100;
export const CAM_POS = [0, 1.8, 6];
export const CAM_TARGET = [0, 1.5, 0];
export const ZOOM_MIN = 1.0;
export const ZOOM_MAX = 15;
export const POLAR_MAX = Math.PI * 0.55;