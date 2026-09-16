# SNAKE — Cinematic Edition: Design Document

Constraint: `index.html` is a thin layer. All logic lives in `js/`.

---

## 1. Vision

A classic top-down Snake game reimagined as a cinematic real-time 3D scene:
a sunlit arena with PBR materials, drifting environmental dust, a living
water pond that is an actual gameplay hazard, event-driven camera shake, and
a filmic post-processing grade. No asset pipeline, no build step — everything
procedural.

**Quality bar:** 60 fps desktop / 30 fps mid-range mobile under the quality
tiers. The game must be *playable first* before any visual system is considered
done.

### Non-goals (explicit)

- No multiple arenas, no level editor, no multiplayer.
- No backend, no accounts — leaderboard is local (`localStorage`) behind a provider interface.
- No external assets: every texture, environment map, and sound is generated in code.
- "Cinematic" means lighting, camera language, particles, and post grade — not cutscenes or scripted sequences.
