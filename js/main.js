// SNAKE — Cinematic Edition: composition root (browser only).
// Wires quality tier -> real graphics -> engine -> HUD/audio -> input -> rAF.
// This is the ONLY place the world constructors and the real WebAudio backend
// are imported together. Never imported by Node tests (they mock graphics).

import { pickQuality, tierConfig, isMobileUA } from './providers/quality.js';
import { createGame } from './game/core.js';
import { createEngine } from './engine/engine.js';
import { installInput } from './input/input.js';
import { createHud } from './ui/hud.js';
import { createSoundBackend } from './ui/audio.js';
import { createRealGraphics } from './world/graphics.js';

function boot() {
  // 1) Quality tier: ?quality= param > localStorage['snake_quality'] > UA.
  let param = null;
  let stored = null;
  try {
    param = new URLSearchParams(location.search).get('quality');
    stored = localStorage.getItem('snake_quality');
  } catch {
    /* no URL/localStorage (rare) — fall through to UA default */
  }
  const isMobile = isMobileUA(navigator.userAgent);
  const quality = pickQuality({ param, stored, isMobile });
  const tier = tierConfig(quality);
  // devicePixelRatio read for diagnostics; the tier already encodes the
  // pixel-ratio strategy (tier.pixelRatio).
  const dpr = window.devicePixelRatio || 1;

  // 2) Real graphics (renderer + scene + visuals + composer for the tier).
  const canvas = document.getElementById('game');
  const graphics = createRealGraphics({ canvas, tier });

  // 3) Sound + HUD (browser WebAudio; unlock is deferred to a user gesture).
  const sound = createSoundBackend();
  const hud = createHud(document.getElementById('hud'));

  // 4) Engine.
  const game = createGame({ rng: Math.random });
  const engine = createEngine({
    game,
    sound,
    graphics,
    clock: { now: () => performance.now() },
    quality,
  });

  const unlockIfNeeded = () => {
    if (!sound.isMuted()) sound.unlock(); // first gesture enables audio
  };

  // 5) Event wiring. (resume sfx already fired by engine.resume()).
  engine.on('eat', (e) => {
    const at = performance.now();
    graphics.rig.events.eat(at); // small camera shake
    graphics.burst.emitBurst(e.c, e.r); // particle burst at the eaten cell
    sound.play('eat');
  });
  engine.on('death', () => {
    graphics.rig.events.death(performance.now()); // large camera shake
    sound.play('death');
  });
  engine.on('state', (evt) => {
    hud.setState(evt);
  });
  engine.on('mute', (evt) => {
    hud.setMuted(evt.muted);
    sound.setMuted(evt.muted);
  });

  // 6) Input (engine does not consume input events — routed here).
  installInput({
    emit(evt) {
      if (evt.type === 'turn') {
        engine.turn(evt.dir);
      } else if (evt.type === 'start') {
        unlockIfNeeded();
        engine.start();
      } else if (evt.type === 'pause') {
        const st = engine.snapshot().state;
        if (st === 'playing') engine.pause();
        else if (st === 'paused') engine.resume();
      } else if (evt.type === 'mute') {
        unlockIfNeeded();
        engine.mute();
      }
    },
    document,
  });

  // Auto-pause when the tab is hidden.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && engine.snapshot().state === 'playing') engine.pause();
  });

  // 7) Resize (engine routes to graphics.size).
  const doResize = () => engine.resize(window.innerWidth, window.innerHeight);
  window.addEventListener('resize', doResize);
  doResize();

  // Initial HUD paint (menu state) before the loop.
  hud.setState(engine.stateEvt(engine.snapshot()));

  // 8) rAF loop. dt clamped to 100 ms; engine.update() internally renders.
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(now - last, 100);
    last = now;
    engine.update(dt);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  console.info('[snake] quality=%s dpr=%s', quality, dpr);

  // 9) Dev-only affordance (R-TEST-03 support): expose a small read/debug handle
  // so the browser checklist can observe exact state transitions (direction,
  // state, score) and drive the same engine control methods already routed from
  // the keyboard. Read-only for gameplay; does not alter normal play.
  window.__snake = {
    state: () => engine.snapshot(),
    interval: () => engine.game.tickIntervalMs(engine.game.state()),
    events: (fn) => engine.on('death', fn),
    quality,
    start: () => engine.start(),
    turn: (dir) => engine.turn(dir),
    pause: () => engine.pause(),
    resume: () => engine.resume(),
    mute: () => engine.mute(),
  };
}

boot();
