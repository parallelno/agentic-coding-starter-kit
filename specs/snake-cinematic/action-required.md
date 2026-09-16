# Action Required — Manual Steps

## Before implementation
None. All required inputs (design decisions, CDN pin, quality tiers, water
layout, bus event names) are fully captured in `requirements.md` and inlined
in each task file.

## During implementation
None. Every task is self-contained; no external accounts, API keys, tokens,
DNS changes, or service registration are required.

## After implementation (verification)
These are **human-verification** steps, not blocking build steps. Do them in
this order:

1. Serve the app over HTTP (three.js import-map requires `http(s)://`, not
   `file://`):
   - From the repo root: `python -m http.server 8000`
   - Or VS Code Live Server.
   - Open `http://localhost:8000/` in Chrome/Edge (Safari/Firefox work but the
     audio unlock path is most reliable on Chromium first).
2. Confirm the `High` tier auto-detects on desktop and `Low` (or `Medium`)
   on mobile; flip tiers manually via the HUD buttons.
3. Play a full game: start → eat 3 food → enter water once → die on wall →
   restart → die on self. Confirm:
   - Score reaches 30, speed display ~2.1× at 3 food.
   - Water slows the cadence to ~50% and fires **one** `splash` on entry.
   - Death fires `death` SFX + camera shake power 1.0.
4. Reload the page and confirm the leaderboard persists (top-10 sorted desc,
   capped at 10, stored under key `snake-cinematic:leaderboard`).
5. Resize the window — the scene stays framed, no stretched aspect.
6. Open the DevTools Console. **Zero errors or warnings** is the bar.
7. (Optional) Serve the folder on a mid-range mobile device (via a local
   network share or `python http.server` on the same IP) and confirm 30 fps
   on the `Low` tier with dust off and shadows off.

## Known runtime caveats
- **WebAudio autoplay policy:** the first audio play is gated on the first
  `pointerdown`/`keydown` — the app unlocks the `AudioContext` on the very
  first user interaction, so ambient wind/water noise starts only after the
  player has pressed a key or tapped the canvas.
- **CDN availability:** `three@0.160.0` is loaded from `unpkg.com`. If the
  network blocks `unpkg.com`, the app will show the import-map load error in
  the console; the intended fix is to switch the import-map to
  `cdn.jsdelivr.net/npm/three@0.160.0/…`. No code change is needed for the
  game itself.
- **`file://` will not work.** The `index.html` includes a plain (non-module)
  script that replaces the body with a "Serve over HTTP" notice when
  `location.protocol === 'file:'`.
- **`matchMedia('(prefers-reduced-motion: reduce)')`** caps the auto-detected
  tier at `Medium` and disables dust + follow-shake per
  `requirements.md §Quality tiers`.

## No manual steps required
All other setup (dependency installation, build config, environment
variables, asset downloads, cloud service configuration) is **not** part of
this feature by design. There is intentionally no `package.json`, no
bundler, and no asset pipeline.
