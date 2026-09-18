# SNAKE — Cinematic Edition: Design Document

## Vision

A classic top-down Snake game reimagined as a cinematic real-time 3D scene:
a sunlit arena with PBR materials, drifting environmental dust, a living
water pond that is an actual gameplay hazard, event-driven camera shake, and
a filmic post-processing grade. No asset pipeline, no build step — everything
procedural.

**Quality bar:** 60 fps desktop / 30 fps mid-range mobile under the quality
tiers. The game must be *playable first* before any visual system is considered
done.

## Non-goals

- No multiple arenas, no level editor, no multiplayer.
- No backend, no accounts — leaderboard is local (`localStorage`) behind a provider interface.
- No external assets: every texture, environment map, and sound is generated in code.
- "Cinematic" means lighting, camera language, particles, and post grade — not cutscenes or scripted sequences.

## Prerequisites

### Plan

- Plan must have multiple milestones.
- Plan must contain the implementation checklist section at the end for the user verification.
- Each milestone except scafolding must be playable and testable.
- The architecture must be easy modular, maintanable, clean.

### Art

- Find texturtes and meshes in the Internet.

### Implementation

- JavaScript.
- `index.html` is a thin layer. All logic lives in `js/`.
- Use libraries, do not reinvent the wheel.
- Store screenshots of each milestone into `results/screenshots/`
- Store short implementation summary of each milestone into `results/impl_log/`

### Game

- Game must have a welcome screen with Game, Settings, Leaderboard, Quit settings with snake chasing apples on the background.
- One level.
- The end shows a popup window with score, and menu: Menu, Restart.