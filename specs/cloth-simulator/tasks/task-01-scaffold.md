# Task 01: Scaffold — page, dev server, scene, camera
Wave: 1
Depends on: —
Owns: `index.html`, `css/style.css`, `js/main.js`, `js/config.js`, `server.js`, `results/.gitkeep`
Risk: normal
Requirements: R1 (environment only; cloth itself is Task 03), R7, R8 (hint node + mode skeleton only), N3, C1, C2, C3, C4 (constants live here)

## Goal
A runnable page at `http://localhost:8123/` that renders a neutral 3D environment (floor, lights, skydome) with a working orbit/pan/zoom camera and a static control hint. The scene and loop must be shaped so later tasks plug in the cloth, interactions, and water without structural rework. Scope boundary: NO cloth, NO grab, NO water — this task only proves the shell.

## Contract
- `index.html`: `<canvas>` or renderer-appended canvas filling the viewport; import map mapping `three` → `./node_modules/three/build/three.module.js` and `three/addons/` → `./node_modules/three/examples/jsm/`; loads only `css/style.css` and `js/main.js`.
- `js/config.js`: exports ALL named constants from `requirements.md` (R1–R8, C2–C4) exactly as specified: `GRAVITY=-9.8`, `DT_SUB=1/120`, `DT_SUB_MAX=5`, `N_CONSTRAINTS=6`, `TEAR_STRAIN=0.35`, `WATER_TEAR_GAIN=0.05`, `HIT_R=0.06`, `IMPULSE_K=0.35`, `WET_ABSORB_PER_HIT=0.02`, `COLS=32`, `ROWS=24`, `WET_DIFFUSE=0.25`, `PINNED_POS=[[-1.0,2.2,0],[1.0,2.2,0]]`, `PINNED_IDS` derivable from COLS, `DRY_RGB=[0.96,0.96,0.94]`, `WET_RGB=[0.35,0.42,0.55]`, `CLOTH_W=2.0`, `CLOTH_H=1.5`, `CLOTH_Y=2.0`, `RATE=900`, `WATER_SPEED=6.5`, `WATER_LIFE=1.5`, `WATER_JITTER=0.25`, `WATER_MAX=1024`, `CAM_FOV=50`, `CAM_POS=[0,1.8,6]`, `CAM_TARGET=[0,1.5,0]`, `ZOOM_MIN=1.0`, `ZOOM_MAX=15`, `POLAR_MAX=Math.PI*0.55`, `FLOOR_SIZE=12`, `FLOOR_COLOR=0x8a8f96`, `MATERIAL_BASE=0xf5f4ef`.
- `js/main.js`: WebGL renderer (antialias on), scene, hemisphere light + directional key light from `(3,5,2)` with gentle shadows optional (do not enable if it hurts perf), floor plane per R1, skydome (large inverted sphere or scene.background gradient), camera + `OrbitControls` per R7 (including `maxPolarAngle`, `minDistance`/`maxDistance`, target `(0,1.5,0)`), rAF frame loop implementing the C3 structure with `simAcc`/`DT_SUB` bookkeeping already in place (loop body may be empty for now — later tasks fill it), static control hint DOM node per R8 text, keyboard handler skeleton (`H` toggles `mode` variable between `'grab'`/`'hose'` and updates cursor; no other behavior yet).
- `?debug=1` hook (documented in README checkpoint): with the query param present, `window.__dbg = { scene, camera, renderer, state() }` (later tasks extend this object — keep the name stable). `P` with `?debug=1` captures `renderer.domElement.toDataURL('image/png')` and POSTs `{file: name, dataUrl}` to `POST /save`; `name` defaults to `cloth.png`. The hook must never run without `?debug=1`.
- `server.js`: dependency-free Node static file server on port 8123 serving the repo root with correct MIME types for `.js/.mjs/.css/.html/.png/.ico`, plus `POST /save` that accepts JSON `{file, dataUrl}` (strip `data:image/png;base64,` prefix), decodes, and writes to `results/screenshots/{file}` (create dirs as needed). Rejects paths with `..`.
- `results/.gitkeep`: keeps the `results/screenshots` path creatable.

## Acceptance And Verification
- `node server.js` starts and `http://localhost:8123/` loads with no console errors (N3) — browser check.
- [Visual/manual] Drag empty space: camera orbits around target `(0,1.5,0)`, with damping; right-drag pans; wheel zooms between the 1.0–15 m limits; view cannot go below the floor (polar clamp) — R7, browser check.
- [Visual/manual] Scene shows floor plane (12×12, `0x8a8f96`), skydome background, visible lighting on the floor — R1 environment, browser check.
- [Visual/manual] Top-left control hint shows the R8 two-line text; pressing `H` switches the page cursor between `grab` and `crosshair` — R8 skeleton, browser check.
- `P` with `?debug=1` produces a PNG file under `results/screenshots/` — browser + filesystem check.
