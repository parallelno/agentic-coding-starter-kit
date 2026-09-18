# Plan: GLOBE SERPENT — Cinematic Edition (sphere snake)

A top-down real-time 3D snake game played on a spinning globe (three.js). The snake hunts a small herd of fleeing rabbits through terrain (ponds, cone trees, fruits) and bonuses (hearts, boots, scissors), while drifting clouds periodically obscure the view. Camera frames the whole planet. Zero build step: bare ES modules + import maps; desktop 60fps / 30fps mobile under quality tiers.

## Stack / base decisions (user-confirmed)
- Redesign in place — reuse three.js 0.186.0 + postprocessing 6.39.5 (jsDelivr import maps), Loop (fixed step + alpha), Events (bus), input.js, quality tiers, shake, server.js (/save screenshot), config.js.
- Globe grid: lat/long (lon wraps; poles are soft walls — moves beyond the lat bounds are no-ops).
- Rabbits: small dynamic herd (3–5 alive at once). Each hops 1 cell per interval and flees the snake head; despawns after a timeout and respawns elsewhere so it never piles up.
- Clouds: visual obstruction only. No damage, no slow.
- Assets: recognizable prop/entity meshes are downloaded from free/CC0 sources and committed under `assets/` (see the **Asset policy** section); only simple geometry (the globe sphere, clouds) may be procedural.
- Plan storage: this durable artifact. The existing `design/plan.md` for the flat-grid concept is preserved/retired.
- Quality rule: every milestone except M0 (scaffolding) ends in a playable, testable state.

## Asset policy (user-confirmed)
Recognizable creatures/props are **not** faked with primitives — they are downloaded from **free / CC0 sources** and committed under `assets/` (each file's license + author credited in `assets/CREDITS.txt`).

- **Allowed free sources:** Poly Pizza (Quaternius CC0 pack), Kenney.nl (CC0), Sketchfab (filter to CC0 / "free"), open game-art databases. The environment HDRI stays the three.js examples MIT map (vendored in `assets/`).
- **Procedural allowed (simple geometry only):** the globe sphere itself (`sphere.js`), cloud puffs (`clouds.js`), and flat surface features (lat/long grid lines, pond water disc).
- **Must be downloaded CC0 meshes:** cone trees, fruits, bonus items (heart/boots/scissors), rabbits, and the snake's head. The snake's per-cell capsule **body** is the one exception, because the grid-snake mechanic requires a segmented chain; its **head** is a real CC0 asset for identity.
- **Loading:** three.js `GLTFLoader` via the import-map path `three/addons/loaders/GLTFLoader.js`; keep meshes low-poly for mobile tiers; credit each source in `assets/CREDITS.txt`.
- **Fetch timing:** at dev time as each milestone needs it — trees @ M2, snake head + rabbits @ M3, fruits @ M4, bonuses @ M5 — then commit the files so the repo stays self-contained and `node server.js` works offline.

## Grid & controls
- Globe: sphere of radius R=10 (world units). Cell grid: LOY=36 (longitude steps), LAY=18 (latitude steps). Cell (i,j): i∈0..LOY-1 wraps, j∈0..LAY-1 poles inclusive.
- Neighbor math + geodesic distance in `js/core/globe.js`: `toWorld(cell) -> {pos, tangent (east), normal}` (Vector3s). `neighbor(cell, dir)` returns null at poles; wraps in lon. `dist(a,b)` = central angle.
- Controls (arrow keys = absolute headings; A/D = relative to current heading):
  * Heading set H = {east=+lon, west=-lon, north=+lat, south=-lat}.
  * ArrowRight / A: from current heading h, set to left-of-h in the lon-symmetric sense: east→north→west→south→east (a 90° CCW rotation around the "up" axis in the local tangent plane).
  * ArrowLeft / D: CW rotation of the same ring.
  * ArrowUp / W: face "away from equator" = north if j<LAY/2 else south.
  * ArrowDown / S: face toward equator = south if j<LAY/2 else north.
  * 180° reversal always rejected; input buffer max 2 (matches current `queueDir` semantics).
- Fixed logic step reuses `Loop`; base step at 8 cells/s; +0.25/fruit or rabbit eaten, cap 14 (existing SPEED config).

## Mechanics
- **Health:** 3 hearts. 0 = game over.
- **Pond cells:** circular-ish patches (2–4 connected cells) scattered procedurally (seeded) avoiding the spawn ring (radius 4 cells). Stepping head onto a pond: −1 health, head stays on the last non-pond cell (bounce). If health=0, game over.
- **Cone trees:** single-cell hazards scattered (seeded) avoiding spawn ring and pond cells. Stepping head onto a tree: −1 health, and the snake's heading is reoriented to a random left or right relative to its current heading. If that new heading leads onto a wall/pond/tree, the snake does not move this step (stunned tick). No bounce.
- **Rabbits (M3):** 3–5 alive at once. Each occupies a free non-hazard non-snake cell. Every interval, if `dist(rabbit, snakeHead) <= 4` (central-angle threshold), it tries up to 10 random neighbor hops (non-hazard, non-snake, outside pond, non-overlap with other rabbits) picking one that maximizes distance from snakeHead; else a random hop. Despawn after 9 intervals with no escape (i.e. it's near the snake), respawn on a random safe cell. If snakeHead lands on a rabbit's cell on the same step, the rabbit is eaten: snake grows 1, score +10.
- **Fruits (M4):** 1–2 on the globe at a time. Free safe cell. Eat: +1 health (cap 3), snake does NOT grow, score +5. Respawn after eat.
- **Bonuses (M5):** rare 3-way roll on "bonus spawn" tick (every ~15s): heart (+1 health), boots (speed +0.75 cells/s for 5s), scissors (snake shrinks to LEN_MIN=3, keeping head and existing tail positions; middle segments are removed). Bonuses are visualized on the surface and consumed when the head reaches the cell.
- **Clouds (M6):** N=6–8 patch instances (billboard-ish spheres or a shader-based "fog" region tied to a lat/long center + radius). Each drifts along a slow great-circle path (period 40–70s). A cell is obscured if `dist(cell, cloudCenter) < cloudRadius`. Obscured region renders with a soft white overlay (custom shader on the terrain / or an alpha-blended "cloud" material layer) at ~0.7 alpha; game logic is unchanged.

## Camera
- Orthographic-ish framing of the entire planet fits the viewport: camera at distance R*3.2, fov 35, positioned on a fixed axis (default "north-pole-ish" view tilted 25°) so the whole sphere fills ~80% of the screen min dimension, with a subtle parallax bias (±5%) toward the snake's head so the action is centered but the sphere stays "globe-shaped", not a local patch.
- Sun tracks the snake's cell (same pattern as the current `main.js`) to keep shadows inside the frustum.

## Reused / new files (relative to `c:\Work\Programming\agentic-coding-starter-kit`)

### New / heavily modified
- `index.html`: keep import maps (same), point to `js/main.js` (kept) with new contents — so `server.js` continues to serve.
- `js/main.js`: full rewrite of the bootstrap for the sphere scene: sphere geometry, cell grid overlay (subtle lat/long lines), sun + hemi, HDRI background, Loop (existing class), wire new Game, new views.
- `js/config.js`: replace GRID with `GLOBE{LOY,LAY,R,POLES_SAFE}`, add `HEALTH_MAX`, `HEALTH_START`, `POND_DENSITY`, `TREE_DENSITY`, `POND_RADIUS_CELL`, `FLEA_RADIUS`, `RABBIT_COUNT`, `RABBIT_FLEE_INTERVAL_MS`, `RABBIT_DESPAWN_TICKS`, `BONUS_SPAWN_EVERY_S`, `BONUS_EFFECTS`, `CLOUD_COUNT`, `CLOUD_RADIUS_CELLS`, `CLOUD_DRIFT_PERIOD_S`, `LEN_MIN`, `SPEED` (existing), `SNAKE_START`, `COLORS` (existing + additions).
- `js/core/globe.js` (new): `toWorld`, `neighbor`, `dist`, `randomSafeCell`, `ringDistance`.
- `js/core/game.js` (rewrite): same public surface (`events`, `step`, `score`, `alive`, `speedNorm`, `snake`, `prevSnake`, `reset`, `queueDir`) but state is (cells + heading), hazards (`pondSet`, `treeSet`), rabbits array, fruits array, bonuses array, health, timers. Emits events: `COLLECT_RABBIT`, `COLLECT_FRUIT`, `BONUS_EAT`, `HAZARD_STEP` (subtype: pond|tree), `HEALTH_CHANGE`, `RABBIT_HOP`, `RABBIT_DESPAWN`, `RABBIT_SPAWN`, `CLOUD_UPDATE` (throttled), `DIE`.
- `js/core/loop.js`: unchanged.
- `js/core/events.js`: unchanged.
- `js/core/input.js`: rewrite — keep the Events + restart signature; rework the keymap for the new heading model; keep the F12/KeyP screenshot hook.

### New world modules
- `js/world/sphere.js` (new): builds the visible globe — a low-poly sphere with a subtle lat/long wireframe grid baked into a texture or a LineSegments overlay; per-cell colorable via a dynamic DataTexture atlas so hazard/bonus cells read clearly. *(Procedural — the globe is an allowed simple-geometry exception.)*
- `js/world/pond.js` (new): pond cells — a translucent bluish water surface + animated normal offset on the sphere at the hazard cells (flat disc meshes tangentially aligned to the normal, slightly above the surface). *(Procedural surface feature — allowed.)*
- `js/world/tree.js` (new): cone trees — **downloaded CC0 low-poly conifer/cone-tree mesh** (free source), 1 instance per hazard cell, tangentially aligned; InstancedMesh for perf. *(Real asset, not procedural.)*
- `js/world/fruit.js` (new): fruit — **downloaded CC0 fruit mesh** (e.g. apple/cherry from a free CC0 pack); gentle bob; eaten on head-arrival. *(Real asset.)*
- `js/world/bonus.js` (new): 3 bonus items (heart, boots, scissors) — **downloaded CC0 pickup/icon meshes** (recognizable, so real assets, not primitives); consumed on head-arrival. *(Real assets.)*
- `js/world/rabbits.js` (new): small herd; each rabbit = **downloaded CC0 rabbit/animal mesh** (free source); position + rotation follow the cell's tangent basis; hop animation (small parabolic arc between cells over one interval); despawn = scale-down 0.25s then respawn. *(Real asset.)*
- `js/world/clouds.js` (new): N instances; each a translucent sphere (or a "fog" shader billboard) placed tangentially above the cell; drift along great circles; when a cell is obscured the underlying terrain darkens via a per-cell "cloudiness" uniform in `sphere.js` (a second DataTexture channel). *(Procedural — clouds are an allowed simple-geometry exception.)*
- `js/world/snake.js` (rewrite of current): segments sit on sphere cells — for each cell, compute pos/norm/tangent from `globe.js`; the segment is a capsule whose axis aligns along the tangent and whose cross-section normal is the cell normal. Growth/shrink handled by add/drop at tail while keeping head+tail cells stable. *(Body stays a segmented capsule because the grid mechanic requires it; the **head uses a downloaded CC0 snake/serpent head mesh** for identity.)*

### New camera / fx
- `js/cam/globe.js` (new): the "whole-planet" camera — fixed distance, fov, orientation as above; subtle parallax bias; reuses the existing `Shake`.
- `js/cam/shake.js`: unchanged.
- `js/fx/*`: unchanged (dust, particles) but particle bursts retargeted to the new events (rabbit collect, hazard hit, bonus consume, death).

### New UI (the flat UI files are not started, so we build the globe UI directly)
- `js/ui/hud.js`: top bar — score, health hearts (3 pips), speed multiplier (indicator), FPS (optional `?debug=1`).
- `js/ui/menu.js`: welcome / settings / leaderboard (localStorage top-10, same provider interface as the flat plan).
- `js/ui/settings.js`: quality tier (Low/Med/Hi/auto), volume, camera shake, "cloud density" override (None/Low/High as a debug knob — optional).
- `js/ui/gameover.js`: popup after death: score, rabbits eaten, best, [Menu][Restart].
- `js/ui/style.css`: shared.

### Audio
- `js/audio/sfx.js`: WebAudio procedural — collect blip, hazard thud, bonus chime, death sting, UI click. Master volume from settings; resume on first user gesture.

### Dev / artifacts
- `server.js`: unchanged (serves the new files; `/save` endpoint for screenshots).
- `results/screenshots/`, `results/impl_log/`: one entry per milestone.

## Milestones (each ends playable + testable)

### M0 — Scaffold: globe math + sphere visual + minimal snake
- New `js/core/globe.js` (`toWorld`, `neighbor`, `dist`, `randomSafeCell`) with small unit sanity checks (documented in impl log).
- Rewrite `js/main.js`: sphere + lat/long grid overlay + sun/hemi/HDRI + Loop + Events + new Game stub (no hazards, no rabbits, no health — just a 3-cell snake) + new SnakeView on sphere + input (4-way, no 180°) + fixed step + follow/parallax camera + resize.
- `config.js`: all new constants (`GLOBE`, `SPEED`, `SNAKE_START`, `LEN_MIN`, `POLES_SAFE`).
- Playable: snake moves around the globe, can wrap lon, poles clamp; no death, no apples yet (score frozen).
- Verify: 360° lon wrap; up/down near poles is a no-op; left/right rotation is correct for each heading; frame time <16ms desktop; screenshot `m00_scaffold.png`.

### M1 — Playable loop: apples (placeholder) + score + death + restart
- Game: apple spawn on a random safe cell (reuse the pattern from flat `game.js`); on eat, grow +1, score +10, speed +0.25; no hazards yet → snake dies only by self-collision. Health mechanic not in play while no hazard exists.
- UI: score top-left, "Died — press R" overlay; R resets.
- Verify: full round playable; self-collision death works; restart works; growth visible; screenshot `m01_play.png`.

### M2 — Health + pond + cone trees
- Ponds (2–4 clusters, seeded random, avoid spawn ring): stepping head into pond: −1 health, head stays on last non-pond cell.
- Cone trees (10–15 cells, seeded random, avoiding spawn ring + ponds): stepping into a tree: −1 health, heading = random left or right; if that new heading is blocked (wall/pond/tree), head does not move this tick ("stunned").
- HUD: 3 health pips, visible decrement.
- Health=0 → game over (reuse M1 death path).
- Verify: hit pond → −1 pip, head bounces; hit tree → −1 pip, heading flips; health=0 → death; screenshot `m02_hazards.png`.

### M3 — Rabbits (herd) + despawn/respawn
- 3–5 rabbits alive at once; each hop-interval: if `dist<=FLEE_RADIUS`, pick the neighbor hop that maximizes dist; else random hop; never onto hazard/snake/pond/another-rabbit; despawn after `RABBIT_DESPAWN_TICKS`, respawn on a random safe cell (with a small scale-in animation).
- Snake head landing on a rabbit cell: +10 score, +1 length, respawn timer for that slot.
- HUD: rabbit count indicator (optional); score from rabbits now.
- Verify: at least one rabbit visible fleeing at all times during a chase; despawn + respawn cycle observable; eating a rabbit grows the snake; screenshot `m03_rabbits.png`.

### M4 — Fruits + healing
- 1–2 fruits spawn on safe cells; eaten → +1 health (cap 3) +5 score, snake does NOT grow; respawn after eat with a small delay.
- Verify: can restore health to 3; fruit does not grow the snake; score increments by 5; screenshot `m04_fruits.png`.

### M5 — Bonuses (heart, boots, scissors)
- Bonus spawn tick every `BONUS_SPAWN_EVERY_S`: pick one of {heart, boots, scissors} uniformly at random → 1 instance appears at a random safe cell, persists until eaten (or 60s lifetime).
- Effects:
  * heart: +1 health (cap 3).
  * boots: speed +0.75 cells/s for 5s (additive to current; clamped by `SPEED.MAX`).
  * scissors: snake length → `LEN_MIN` (keep head + tail cells, remove middle body segments).
- HUD: bonus countdown while boots active; scissors is a one-shot with a small flash.
- Verify: each bonus fires its effect exactly once; heart caps at 3; boots raises `speedNorm`; scissors shrinks to `LEN_MIN` (and subsequent eating regrows from `LEN_MIN`); screenshot `m05_bonuses.png`.

### M6 — Clouds (obstructing)
- N=6–8 cloud instances; each drifts along a great circle (slow, period 40–70s); a cell is obscured if `dist(cell, cloudCenter) < CLOUD_RADIUS_CELLS`.
- Rendering: per-cell cloudiness channel on the sphere texture (DataTexture 2nd channel, updated on cloud tick); plus a visible "cloud body" (translucent sphere) above the surface so the player can see what's blocking them.
- No logic change (clouds are purely visual risk).
- Verify: at least one cloud passes over the snake's region within a typical match; obscured cells visibly whiten; no gameplay side-effect (speed/score/health unchanged by clouds); screenshot `m06_clouds.png`.

### M7 — Finale: full UI, camera language, audio, settings, quality tiers, polish
- Full UI: menu (Game/Settings/Leaderboard/Quit), settings (quality, volume, shake, cloud density), leaderboard (localStorage top-10), gameover popup (score, best, [Menu][Restart]).
- Camera: subtle parallax toward snake head (whole planet in frame); shake on collect/hazards/death.
- Audio: all sfx wired; volume from settings; no errors pre-gesture.
- Quality tiers (Low/Med/Hi/auto): pixel ratio, shadows, dust, cloud count, AA; mobile auto-detect.
- Final pass: pause on blur/Esc, `?debug=1` FPS, draw-calls budget sanity (<40 on Hi desktop), README quick-start, license check for any vendored assets.
- Verify: full loop Play→Eat→Hit hazards→Death→Popup→Restart; settings persist; leaderboard persists; mobile sim ≥30fps; draw calls <40 desktop Hi; screenshots `m07_menu.png`, `m07_gameover.png`, `m07_mobile_sim.png`.

## Verification checklist (per milestone, for user verification)

### M0 — Scaffold
- [ ] `js/core/globe.js` exposes `toWorld` / `neighbor` / `dist` / `randomSafeCell` and passes the sanity checks in impl log
- [ ] `js/main.js` bootstraps the sphere + lat/long grid + sun/hemi + HDRI + Loop + Events
- [ ] Snake (3 cells) is visible on the sphere and moves under arrow keys (and A/D for relative turns)
- [ ] Longitude wraps: pressing right from lon=LOY-1 lands on lon=0 (and vice-versa for left)
- [ ] Poles are no-ops: at j=0 pressing up does nothing; at j=LAY-1 pressing down does nothing
- [ ] 180° reversal is rejected (pressing left while heading right does nothing this tick)
- [ ] Input buffer caps at 2 (fast double-turn works; triple within one interval only applies 2)
- [ ] Camera frames the whole planet; planet occupies ~70–90% of the smaller viewport dimension
- [ ] Desktop 55+ fps (debug FPS visible with `?debug=1`)
- [ ] Screenshot `results/screenshots/m00_scaffold.png` saved
- [ ] `results/impl_log/milestone-00-scaffold.md` written

### M1 — Playable loop
- [ ] Apples (placeholder) spawn only on safe cells (safe = unoccupied & not the spawn ring)
- [ ] On eat: score += 10, snake grows +1, speed += 0.25 (capped at `SPEED.MAX`)
- [ ] Self-collision → death overlay ("Died — press R to restart")
- [ ] R restarts the game (score reset, snake reset to LEN, speed reset to BASE)
- [ ] Screenshot `results/screenshots/m01_play.png` saved
- [ ] `results/impl_log/milestone-01-playable.md` written

### M2 — Hazards + health
- [ ] 2–4 pond clusters visible at start (blue patches), none in the spawn ring
- [ ] 10–15 cone trees visible at start, none on a pond cell, none in the spawn ring
- [ ] Head into a pond: −1 health pip, head stays on the previous non-pond cell (observable bounce)
- [ ] Head into a tree: −1 health pip, heading flips to a random left or right relative to the previous heading
- [ ] Tree stun: if the new heading after a redirect is also blocked (wall/pond/tree), the head does not move that tick
- [ ] Health = 0 → death overlay (same as M1); restart works
- [ ] HUD shows 3 heart pips; pips decrement on hazard hit; never exceed 3
- [ ] Screenshot `results/screenshots/m02_hazards.png` saved
- [ ] `results/impl_log/milestone-02-hazards.md` written

### M3 — Rabbits
- [ ] 3–5 rabbits alive at all times (despawn + respawn within `RABBIT_DESPAWN_TICKS`)
- [ ] Rabbits only ever occupy safe cells (never on hazard/pond/snake/other-rabbit cells)
- [ ] Within `FLEE_RADIUS` of the head, the rabbit picks the hop that maximizes distance (observable: it runs away)
- [ ] Snake head landing on a rabbit cell: +10 score, +1 length, slot respawned
- [ ] HUD score reflects rabbit eats
- [ ] Screenshot `results/screenshots/m03_rabbits.png` saved
- [ ] `results/impl_log/milestone-03-rabbits.md` written

### M4 — Fruits
- [ ] 1–2 fruits visible at a time on safe cells
- [ ] Eating a fruit: +1 health (capped at 3), +5 score, no growth
- [ ] Fruit does not appear on hazard/pond/snake/rabbit cells
- [ ] Fruit respawns after being eaten (with a short delay)
- [ ] Screenshot `results/screenshots/m04_fruits.png` saved
- [ ] `results/impl_log/milestone-04-fruits.md` written

### M5 — Bonuses
- [ ] Bonus ticks fire every `BONUS_SPAWN_EVERY_S`; one of {heart, boots, scissors} spawns
- [ ] Heart: +1 health (capped at 3)
- [ ] Boots: speed +0.75 cells/s for 5s; HUD countdown shows; after 5s speed returns
- [ ] Scissors: snake length = `LEN_MIN` (keep head + tail); visual flash; subsequent eats regrow from `LEN_MIN`
- [ ] All three bonuses are visually distinguishable from fruits and rabbits
- [ ] Bonuses despawn after a 60s lifetime if uneaten
- [ ] Screenshot `results/screenshots/m05_bonuses.png` saved
- [ ] `results/impl_log/milestone-05-bonuses.md` written

### M6 — Clouds
- [ ] N=6–8 clouds visible at start, each translucent sphere above the surface
- [ ] Clouds drift along great circles at the configured period (40–70s)
- [ ] A cell under a cloud visibly whitens (cloudiness layer)
- [ ] No gameplay effect from clouds: score, speed, health, rabbit hops unchanged by cloud presence (verified with a scripted run that toggles a cloud over the snake region and compares)
- [ ] At least one cloud passes over the snake's head region during a typical 2-minute match
- [ ] Screenshot `results/screenshots/m06_clouds.png` saved
- [ ] `results/impl_log/milestone-06-clouds.md` written

### M7 — Finale
- [ ] Menu: Game / Settings / Leaderboard / Quit all work
- [ ] Settings: quality (Low/Med/Hi/auto), volume, camera shake, cloud density — all persist across reload
- [ ] Leaderboard: top-10 from localStorage persists across reload; "clear all" works
- [ ] Game Over popup: score, rabbits eaten, best, [Menu] [Restart]
- [ ] Pause on blur (and Esc) with overlay
- [ ] `?debug=1` shows FPS; draw calls <40 on desktop Hi
- [ ] Mobile emulation (DevTools) ≥30 fps on Mid tier; auto-selects Mid on mobile UA
- [ ] All sfx fire; no console errors before first user gesture
- [ ] Screenshots `m07_menu.png`, `m07_gameover.png`, `m07_mobile_sim.png` saved
- [ ] `results/impl_log/milestone-07-finale.md` written
- [ ] README quick-start updated (serve command, controls, quality)

## Global decisions (summary)
- Grid: lat/long (LOY=36, LAY=18), lon wraps, poles are no-ops.
- Assets: CC0 meshes for trees / fruits / bonuses / rabbits / snake-head (committed to `assets/` + `CREDITS.txt`); only the globe + clouds (+ flat surface features) are procedural.
- Rabbit flee: flee radius 4 cells (central-angle); despawn timeout 9 intervals; herd size 3–5.
- Clouds: pure visual obstruction (alpha-blended overlay layer + "cloudiness" DataTexture channel). No damage, no slow.
- Health: 3 hearts; 0 = game over; no natural regen.
- Bonuses: 1 spawn per `BONUS_SPAWN_EVERY_S` tick; 60s lifetime; 3 kinds (heart, boots, scissors); scissors shrinks to `LEN_MIN`=3 keeping head+tail.
- Camera: fixed "whole-planet" framing (no zoom in); subtle parallax to head.
- Reused from the existing codebase: three.js stack (versions, import maps), `Loop`, `Events`, input pattern, quality-tier pattern, `shake`, `server.js`, config pattern, `results/` convention.
- Out of scope in this project (intentionally omitted): backend (leaderboard is local only), multiplayer, save-game across sessions, achievements, day/night cycle.

## Files to be created/modified (paths under `c:\Work\Programming\agentic-coding-starter-kit`)
- `index.html` — keep import maps; module import stays `js/main.js` with new contents.
- `js/main.js` — rewrite bootstrap (sphere scene + wiring).
- `js/config.js` — add new constants; keep SPEED pattern.
- `js/core/globe.js` — new.
- `js/core/game.js` — rewrite (globe state, hazards, rabbits, fruits, bonuses, health, timers).
- `js/core/loop.js` — unchanged.
- `js/core/events.js` — unchanged.
- `js/core/input.js` — rewrite keymap for new heading model; keep restart + P screenshot.
- `js/world/sphere.js`, `js/world/pond.js`, `js/world/tree.js`, `js/world/fruit.js`, `js/world/bonus.js`, `js/world/rabbits.js`, `js/world/clouds.js` — new.
- `js/world/arena.js` — retire (replaced by `sphere.js`).
- `js/world/snake.js` — rewrite for sphere tangents.
- `js/cam/globe.js` — new (whole-planet camera + parallax).
- `js/cam/shake.js` — unchanged.
- `js/fx/dust.js`, `js/fx/particles.js` — reuse; retarget particle bursts to new events.
- `js/audio/sfx.js` — new (WebAudio procedural).
- `js/ui/hud.js`, `js/ui/menu.js`, `js/ui/settings.js`, `js/ui/gameover.js`, `js/ui/style.css` — new.
- `assets/` — downloaded free/CC0 meshes (GLB/FBX) + vendored HDRI; license + author per file credited in `assets/CREDITS.txt`.
- `results/screenshots/` — one screenshot per milestone (m00–m07*).
- `results/impl_log/` — one impl summary per milestone (milestone-00 through 07).
