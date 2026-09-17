// js/main.js (T13) — the ONLY composition root of the app. Everything else is
// pure/layered modules; main wires them together and drives the game loop.
//
// Responsibilities:
//   - Read the `three` camera + T10 CameraRig + T13 real graphics so the
//     engine's opaque {size, render} contract is satisfied by WebGL.
//   - Build a deterministic-ish game (T02), the T03 input, the T11 HUD/Sound,
//     a T04 leaderboard + quality pick, and the T05 engine with an injectable
//     clock for tests.
//   - Forward `eat` events to the camera rig (shake) and the sound backend
//     (blip); forward `death` to the rig (cine death dolly + shake) and sound.
//   - Auto-pause the engine when the tab is hidden (R-PERF-03).
//   - Resize the renderer + camera when the window changes (R-WORLD-07).
//
// This is the ONLY file allowed to import across the ui/world/providers/input
// layer boundaries (R-ARCH-01). No other module reaches across those.

import { createGame } from './game/core.js';
import { createEngine } from './engine/engine.js';

import { installInput } from './input/input.js';
import { createRealGraphics } from './world/graphics.js';
import * as THREE from 'three';
import { CameraRig } from './world/camera.js';

import { Hud } from './ui/hud.js';
import { createSoundBackend } from './ui/audio.js';
import { createLeaderboard } from './providers/leaderboard.js';
import { pickQuality, tierConfig, isMobileUA } from './providers/quality.js';
import { defaultRng } from './providers/rng.js';

// ---------------------------------------------------------------------------
// Small DOM helpers (only used at top level in index.html; tests do NOT import
// main.js at all because it pulls in three/WebGL — see R-ARCH-06).
// ---------------------------------------------------------------------------

function byId(id) {
  return typeof document !== 'undefined' ? document.getElementById(id) : null;
}

// ---------------------------------------------------------------------------
// Boot: quality detection (URL param ?quality= low|standard|high, else
// localStorage 'snake_quality', else device sniff). We persist the explicit
// pick so a user's preference sticks across reloads.
// ---------------------------------------------------------------------------

function detectQuality() {
  const param = new URLSearchParams(typeof location !== 'undefined'
    ? location.search
    : '').get('quality');
  const stored = safeReadStored(); // 'low'|'standard'|'high'|undefined
  const isMobile = isMobileUA(typeof navigator !== 'undefined' ? navigator.userAgent : '');
  const picked = pickQuality({ param, stored, isMobile });
  // Persist the explicit pick if any (URL param or stored) so the user's
  // choice survives the reload; auto-detects are NOT saved.
  if (param) safeStore(param);
  return { quality: picked, tier: tierConfig(picked), isMobile };
}

function safeReadStored() {
  try {
    return typeof localStorage !== 'undefined'
      ? (localStorage.getItem('snake_quality') ?? undefined)
      : undefined;
  } catch { return undefined; }
}

function safeStore(value) {
  try { localStorage.setItem('snake_quality', value); } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// App assembly. Exported for tests (which mock `document` and `canvas`) and
// called once on load for the real page.
// ---------------------------------------------------------------------------

export function boot(opts = {}) {
  // --- DOM: index.html provides the canvas and #hud root.
  const canvas = opts.canvas ?? byId('game');
  const hudRoot = opts.hudRoot ?? byId('hud') ?? document.body;

  // --- Quality: URL ?quality= overrides localStorage 'snake_quality',
  //     which overrides the mobile-UA sniff.
  const { quality, tier } = detectQuality();

  // --- Game: default (non-seeded) rng; the leaderboard persists to
  //     localStorage (best 10) unless `opts.leaderboard` is injected.
  const game = createGame({ rng: defaultRng() });
  // Dedicated rng for the cosmetic particle burst. Kept separate from the
  // game's internal rng so the burst never perturbs the deterministic food
  // spawn stream (R-DETERMINISM; the burst is purely visual).
  const burstRng = defaultRng();
  const leaderboard =
    opts.leaderboard ??
    createLeaderboard({
      storage: (typeof localStorage !== 'undefined' ? localStorage : undefined),
    });

  // --- Input: the T03 input installs into document when `document` exists;
  //     in headless tests it degrades to a no-op (input is optional to the
  //     engine — pass undefined when no document).
  const input =
    opts.input ??
    (typeof document !== 'undefined'
      ? { install: installInput }
      : undefined);

  // --- HUD + Audio: the HUD mutates existing #hud children; the audio
  //     unlocks lazily on the first user gesture (autoplay policy).
  const hud = new Hud(hudRoot);
  const sound = opts.sound ?? createSoundBackend({ audioCtx: opts.audioCtx });

  // --- Camera + rig + real graphics (WebGL). The rig and camera are shared
  //     with the engine's opaque graphics object so `main` can forward input
  //     events (`eat`, `death`) to the rig's shake hooks on the SAME rig the
  //     renderer reads from every frame (R-WORLD-08).
  // --- Clock. Injected for deterministic tests; defaults to performance.now.
  const clock = opts.clock ?? { now: () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) };

  const camera = new THREE.PerspectiveCamera(
    50,
    (canvas?.width ?? 960) / (canvas?.height ?? 540),
    0.1,
    200,
  );
  // CameraRig/Shake require an injected now() function (Shake.push stamps the
  // impulse with now()); passing a number crashes on the first eat/death.
  const rig = new CameraRig(() => clock.now());
  const graphics = createRealGraphics({ canvas, camera, rig, tier });
  const engine = createEngine({
    game,
    input,
    sound,
    graphics,
    clock,
    quality,
    leaderboard,
    canvas: { width: canvas?.width ?? 960, height: canvas?.height ?? 540 },
  });

  // --- Input event forwarding. The engine already plays the `eat` and
  //     `resume` blips itself; here we only fan into the camera rig for the
  //     cinematic shake/dolly on `eat` and `death`.
  const offEat = engine.on('eat', (evt) => {
    rig.onEat();
    // Cosmetic particle burst at the eaten-food cell (R-WORLD).
    graphics.burst?.emitBurst(evt.c, evt.r, burstRng);
  });
  const offDeath = engine.on('death', (evt) => {
    rig.onDeath(clock.now());
    sound.play('death');
  });
  // Mute button: reflect the mute state into the HUD overlay.
  const offMute = engine.on('mute', (evt) => hud.setMuted(evt.muted));

  // --- First-gesture unlock for audio (autoplay policy). The engine never
  //     touches AudioContext, so we wire a one-shot unlock on pointerdown /
  //     keydown once, then remove the listeners.
  const onFirstGesture = () => {
    sound.unlock();
    removeGestureListeners();
  };
  function removeGestureListeners() {
    if (typeof document === 'undefined') return;
    document.removeEventListener('pointerdown', onFirstGesture);
    document.removeEventListener('keydown', onFirstGesture);
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('pointerdown', onFirstGesture);
    document.addEventListener('keydown', onFirstGesture);
  }

  // --- Auto-pause when the tab is hidden (R-PERF-03): the engine's tick
  //     loop keeps running on RAF; a long hidden gap could produce a single
  //     huge dt that jumps a lot of ticks at once. Pausing avoids the visual
  //     pop and the audio "eat" queue piling up behind the tab.
  const onVisibilityChange = () => {
    if (document.hidden && engine.gameState() === 'playing') {
      engine.pause();
    }
  };
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibilityChange);
  }

  // --- Renderer + camera resize. The engine owns `graphics.size` and calls
  //     it on `resize()`; we forward the window size there.
  const onResize = () => {
    engine.resize(
      window.innerWidth || canvas.width,
      window.innerHeight || canvas.height,
    );
  };
  if (typeof window !== 'undefined') window.addEventListener('resize', onResize);

  // --- Main RAF loop. The engine drives all ticks via its accumulator;
  //     main.js only feeds dt and calls engine.update() once per frame.
  //     `graphics.render()` (called from inside engine.update) advances the
  //     camera rig (R-WORLD-08) and every world module by one frame.
  const loop = () => {
    const now = clock.now();
    const dtMs = now - lastNow;
    lastNow = now;
    engine.update(dtMs);
    // Re-queue the next frame; without this the game renders exactly one
    // frame and then freezes (the snake never moves, never eats/dies).
    rafId =
      typeof requestAnimationFrame !== 'undefined'
        ? requestAnimationFrame(loop)
        : 0;
  };
  let lastNow = clock.now();
  let rafId =
    typeof requestAnimationFrame !== 'undefined'
      ? requestAnimationFrame(loop)
      : 0;

  // --- State forwarding: every emitted `state` event repaints the HUD
  //     (score / length / best / overlays). The engine emits state on
  //     start/pause/resume/eat/death, so this covers all transitions.
  const offState = engine.on('state', (evt) => hud.setState(evt));

  // --- Initial HUD paint. The engine has no startup `state` emission, so
  //     the menu overlay would otherwise stay hidden on load (R-TEST-03 item
  //     1). Push the current snapshot + leaderboard top/best once, in the
  //     same payload shape the engine emits, so the HUD shows the menu.
  {
    const snap = game.state();
    const top = leaderboard && typeof leaderboard.list === 'function'
      ? leaderboard.list().slice(0, 3)
      : [];
    hud.setState({
      ...snap,
      length: snap.snake.length,
      best: top.length > 0 ? top[0].score ?? 0 : 0,
      top,
    });
  }

  // Handle an explicit start request (e.g. from tests, or a click) so the
  // engine emits its `state` event and the HUD overlays come up correctly.
  // In the browser the user clicks the canvas / presses any key — the T03
  // input already forwards `start` to engine.start() via `_handleInput`.
  return {
    engine,
    graphics,
    camera,
    rig,
    hud,
    sound,
    game,
    leaderboard,
    quality,
    tier,
    // Cleanup (used by tests to cancel RAF + listeners + input detach).
    dispose() {
      offEat();
      offDeath();
      offMute();
      offState();
      if (typeof cancelAnimationFrame !== 'undefined' && rafId) cancelAnimationFrame(rafId);
      removeGestureListeners();
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibilityChange);
      }
      if (typeof window !== 'undefined') window.removeEventListener('resize', onResize);
    },
  };
}

// Auto-boot only when running in the browser with a real #game canvas present
// (index.html loads this module; tests must NOT trigger a boot here, so we
// gate on `document` + `#game`).
if (typeof document !== 'undefined' && byId('game')) {
  boot();
}

export default { boot };
