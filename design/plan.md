# Plan: SNAKE — Cinematic Edition

Top-down real-time 3D snake game (three.js) with cinematic lighting, pond hazard, camera language and filmic post grade. Zero build step: bare ES modules + import maps. Desktop 60fps / 30fps mobile under quality tiers.

## Agreed Decisions (user-confirmed)
- **Assets**: HYBRID — free/CC0 meshes+textures fetched at dev time into `assets/` (committed, credits in `assets/CREDITS.txt`); **sounds always procedural (WebAudio)**; **PBR env map: `royal_esplanade_1k.hdr` from the three.js examples repo (MIT)** served from jsDelivr. Core snake/apple meshes stay procedural (three.js primitives).
- **Plan storage**: `PLAN.md` at repo root (durable artifact, updated per milestone) + this session plan.
- **Stack**: three.js **0.186.0** + postprocessing **6.39.5** as ES modules via import maps in `index.html` (jsDelivr CDN). No bundler, no build step.
- **Screenshots**: in-game F12 capture (`renderer.domElement.toDataURL` → download as `m<N>_<label>.png`); artifacts saved into `results/screenshots/` (manual placement — no browser automation available in-session).
- **Impl notes**: `results/impl_log/milestone-<NN>-<slug>.md` per milestone (written by the agent).
- Quality rule from design: **playable first** — every milestone except M0 is playable & testable.

## Repo Layout
```
index.html            thin layer: canvas, import maps, <script type=module src=js/main.js>, minimal CSS
PLAN.md               this plan (checklist updated as milestones complete)
assets/CREDITS.txt    license/credits for any fetched assets
js/
  main.js             bootstrap: boot, loop, scene graph, module wiring
  config.js           constants: GRID{N,CELL}, SPEED{base,perApple,max}, pond, colors
  core/
    game.js           Game: fixed-timestep update (acc, step=125ms→8cells/s), state machine, score, death
    input.js          keyboard (arrows/WASD), touch swipe, F12 screenshot hook
    events.js         tiny typed event bus (on/emit) — decouples camera/particles/audio
    loop.js           fixed step + render accumulator, clock, pause on blur
  world/
    arena.js          floor/walls/fence meshes, PBR materials; loads env map
    pond.js           water material (time uniform), splash VFX trigger, head-in-check
    obstacles.js      static props (boulders/barrels: CC0 mesh or primitives) outside playfield
    apples.js         apple mesh pool, spawn (random free non-pond cell), collect
    snake.js          CapsuleGeometry segments, growth, head/eye detail, orientation lerp
  cam/
    follow.js         offset follow + smoothing (play & menu)
    shake.js          damped impulse model, enabled by setting, events (collect/death/wall)
    deathcam.js       on death: 0.5s delay → 1.3s slow 360° orbit, then popup
  fx/
    dust.js           drifting dust (Points + custom shader or PointsMaterial, wrap box)
    particles.js      burst pool (collect sparkles, splash droplets, death puff)
  post/
    pipeline.js       postprocessing EffectComposer: Bloom, SMAA (Hi) / FXAA (Med) / none (Low), Vignette, film grain
    quality.js        tier defs (pixelRatio, bloom, AA, dust count, shadows on/off), device heuristic (isMobile via UA+touch)
  audio/
    sfx.js            WebAudio procedural: collect blip, death sting, UI click, splash whoosh (noise+filter)
  ui/
    hud.js            score/life-free top bar, FPS (debug flag)
    menu.js           welcome screen + "snake chasing apples" attract background (menu follow cam + scripted AI snake eating apples)
    settings.js       quality tier, volume, camera shake toggles; localStorage `snake.settings`, audio unlocked on first input
    leaderboard.js    LocalLeaderboardProvider (localStorage top-10 {score,date}); provider interface so a backend could plug in
    gameover.js       popup: score + best, Menu / Restart
    style.css         shared UI styling
results/screenshots/  one screenshot per milestone
results/impl_log/     one impl summary per milestone
```

## Milestones

### M0 — Scaffold (only non-playable milestone)
1. Repo structure above; `index.html` with import maps:
   `"three":"https://cdn.jsdelivr.net/npm/three@0.186.0/build/three.module.js"`,
   `"three/addons/":".../examples/jsm/"`,
   `"postprocessing":"https://cdn.jsdelivr.net/npm/postprocessing@6.39.5/build/postprocessing.esm.js"`
2. `js/main.js` boots scene, PerspectiveCamera, WebGLRenderer (antialias false — AA via post later), resize handler; `core/loop.js` fixed-step loop; placeholder gray floor + debug cube.
3. Env map fetch verified: HDRI loads (royal_esplanade_1k.hdr @ three/examples path on jsDelivr) → `scene.environment`.
4. Verify: page runs (file:// AND via `python -m http.server` — file:// works for CDN scripts; HDRI fetch is cross-origin but jsDelivr sends CORS headers, so file:// OK too).

### M1 — Core gameplay (PLAYABLE)
- Grid 21×21 (cell=1), snake 3 long, fixed 8 cells/s; apples spawn on random free non-pond cell; collect → grow+score+10; collision: self OR wall → dead.
- Input queue (max 2 buffered turns, no 180° reversal); speed +0.25 cells/s per apple, cap 14.
- Placeholder visuals ok (capsule segments, emissive red sphere apple), gray arena.
- Game over → simple on-canvas "Died — press R to restart" (UI comes in M8).
- Verify: can play a full round, die, restart; frame time <16ms on desktop; screenshot `m01_play.png`.

### M2 — Arena + pond hazard (PLAYABLE)
- `arena.js`: sunlit floor (CC0/asphalt or procedural texture), PBR walls/fence around grid, 2–3 static props (obstacle meshes or primitives) outside playfield.
- `pond.js` v1: circular shallow pond (centered, radius ≈ 3.5 cells), flat animated water material (sin-distorted normal offset via small onBeforeCompile or Points-less approach), **head-cell inside pond radius → death ("drowned")** with distinct message; apples never spawn in pond.
- Verify: dying in pond works; water visibly animates; no apple spawns in pond; screenshot `m02_pond.png`.

### M3 — Cinematic environment (PLAYABLE)
- Sun `DirectionalLight` + shadows (Hi/Med), warm key / cool sky fill (Hemisphere), HDRI ambient + background (`royal_esplanade_1k.hdr`, scene.background = env or gradient sky).
- `fx/dust.js`: ~2–4k drifting dust motes in a wrap box, slow noise drift, size-attenuated, additive low-opacity.
- Sunlight + dust visible in play; tone mapping ACESFilmic, sRGB output.
- Verify: shadows + dust + HDRI read; 60fps desktop on Mid tier; screenshot `m03_light.png`.

### M4 — Snake & apple visual identity (PLAYABLE)
- `snake.js`: capsule body segments with rounded joints (instanced or merged), subtle body scale "pulse" on collect, head mesh with eyes, smooth orientation/position lerp between cells, soft contact shadow (baked gradient sprite or shadow map from M3).
- `apples.js`: apple mesh(s) from CC0 mesh or scaled-sphere + stem, emissive rim, gentle bob+spin, collect flash.
- `fx/particles.js` v1: collect sparkle burst + pond splash ring on drowned.
- Verify: snake reads clearly from 30–45° top-down; pulses/bob visible; screenshot `m04_snake.png`.

### M5 — Camera language (PLAYABLE)
- `cam/follow.js`: offset top-down follow with smoothing + subtle lag; menu attract camera (M8 reuses).
- `cam/shake.js`: damped impulse camera shake — small on collect, medium on wall graze (near-miss), large on death; disabled by setting.
- `cam/deathcam.js`: on death → 0.5s hold → 1.3s slow cinematic 360° orbit around head → signal UI to open popup.
- Verify: shake events fire correctly once each; death orbit plays before popup hook fires (stub log ok); screenshot `m05_shake.png`.

### M6 — Post & quality tiers (PLAYABLE)
- `post/pipeline.js` via postprocessing: Bloom (Hi/Med, intensity low), SMAA (Hi) / FXAA (Med) / none (Low), Vignette (all), film grain (Hi/Med).
- `quality.js`: Low = pixelRatio≤1, no shadows, no bloom, AA off, dust 500; Mid = pixelRatio≤1.5, shadows on half-res, SMAA off→FXAA, bloom low, dust 1500; Hi = pixelRatio≤2, full. Auto-detect mobile→Low/Mid; override in settings (M8).
- Verify: all three tiers run; mobile emulation (DevTools) holds ≥30fps; screenshot `m06_hi.png` (+ optional `m06_low.png`).

### M7 — Audio (PLAYABLE)
- `sfx.js` WebAudio: collect (bright sine blip, rising pitch per combo), death (low sting + noise), splash whoosh on pond death, UI confirm/click; master volume from settings; AudioContext resumed on first user gesture; no external files.
- Verify: all sfx fire once; volume slider (stub in debug bar ok); no noise/feedback; screenshot not required (log instead).

### M8 — UI & menus (PLAYABLE, full loop)
- `menu.js`: welcome screen (Game / Settings / Leaderboard / Quit→"session ended" back-to-title state), background = actual scene with scripted attract snake (simple AI: chase nearest apple, turn on threat) under `follow.js` camera with slow orbit drift.
- `settings.js`: quality (Low/Med/Hi/auto), master volume, camera shake on/off — persisted to localStorage, live-applied (rebuild pipeline/swap dust counts without reload).
- `leaderboard.js`: top-10 list, name optional (default "You"), auto-save on game over, clear-all button; provider interface documented in impl log.
- `gameover.js`: popup after death-cam: score, apples, best, [Menu] [Restart].
- Mobile: on-screen turn swipes (input.js touch) + big-tap buttons.
- Verify: full loop Play→Die→Popup→Restart; leaderboards persist across reload; settings persist; screenshot `m08_menu.png` + `m08_gameover.png`.

### M9 — Final polish
- Pause on blur/Esc (overlay), debug FPS flag `?debug=1`, input edge-case audit (fast reversal, pause during death cam), final performance pass (object pool sizes, draw-call budget <30 on Hi), README quick-start (serve command, controls, quality), license header check on vendored assets.
- Verify: all checkboxes below green; final screenshots `m09_desktop_hi.png`, `m09_mobile_sim.png`.

## Global Conventions
- ES modules only; each module named-exports one primary class/factory; no globals; dependency injection via `main.js`; events for cross-module triggers (no direct refs between cam/fx/audio and game).
- `config.js` is the single tuning source.
- No inline event handlers; UI is plain DOM + css, no framework.
- Every milestone ends with: screenshot(s) in `results/screenshots/`, `results/impl_log/milestone-NN-*.md`, `PLAN.md` checklist ticked.

## Final Verification Checklist (user verification)
- [ ] M0: `python -m http.server` (or open index.html) → scene boots, loop runs, env map loads (F12 Network shows .hdr 200)
- [ ] M1: full round playable; self/wall death + R restart; ≥55fps desktop
- [ ] M2: pond kills; water animates; apples never spawn in pond
- [ ] M3: shadows, 2–4k visible dust motes, HDRI ambient+background
- [ ] M4: collect pulse, particle bursts (sparkle + splash) visible
- [ ] M5: shake on collect/death; 360° death orbit precedes popup
- [ ] M6: Low/Mid/Hi tiers switchable; mobile sim ≥30fps; bloom+vignette+grain visible (Hi)
- [ ] M7: all 5 sfx audible; volume persists; no gesture-before-sound console errors
- [ ] M8: welcome (attract snake visible) → Game/Settings/Leaderboard/Quit all work; settings persist; top-10 persists; Game Over popup (score + Menu/Restart)
- [ ] M9: pause/Esc works; ?debug shows FPS; draw calls <30 (Hi desktop); README present; screenshots for every milestone exist in results/screenshots/
- [ ] All results/impl_log notes (10 files) written; PLAN.md fully checked