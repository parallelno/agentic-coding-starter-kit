# SNAKE — Cinematic Edition (spec)

Feature specification for a cinematic, no-build, CDN-Three.js browser Snake
game. See `requirements.md` for the full contract and `action-required.md` for
manual (human) steps.

- **18 tasks** across **6 parallel waves**.
- No `package.json`, no bundler, no assets — plain ES modules + a pinned
  Three.js import map.
- Each task file under `tasks/` is **self-contained**: a coder agent implements
  it from that file alone.

## Dependency graph

Waves run top-to-bottom; within a wave tasks are independent and can run in
parallel. Arrows point *from dependency → dependent*.

```mermaid
flowchart TD
  subgraph W1[Wave 1]
    T01[01 Config &amp; Quality]
    T02[02 Event Bus]
  end
  subgraph W2[Wave 2]
    T03[03 Grid Math]
    T04[04 Renderer]
    T05[05 Audio]
    T06[06 Leaderboard]
  end
  subgraph W3[Wave 3]
    T07[07 Input]
    T08[08 Snake data]
    T09[09 Arena]
    T10[10 Water]
    T11[11 Dust]
    T12[12 Snake Mesh]
    T13[13 Post]
    T14[14 HUD]
    T15[15 Camera]
  end
  subgraph W4[Wave 4]
    T16[16 Food]
  end
  subgraph W5[Wave 5]
    T17[17 State machine]
  end
  subgraph W6[Wave 6]
    T18[18 Integration]
  end

  T01 --> T03
  T01 --> T04
  T02 --> T05
  T02 --> T15
  T02 --> T14
  T01 --> T14
  T06 --> T14
  T01 --> T07
  T03 --> T07
  T01 --> T08
  T03 --> T08
  T04 --> T09
  T01 --> T10
  T03 --> T10
  T04 --> T10
  T01 --> T11
  T04 --> T11
  T01 --> T12
  T03 --> T12
  T04 --> T13
  T01 --> T15
  T04 --> T15
  T03 --> T16
  T01 --> T16
  T10 --> T16
  T08 --> T17
  T07 --> T17
  T16 --> T17
  T10 --> T17
  T18 -.wires everything.-> T01 &amp; T04 &amp; T05 &amp; T06 &amp; T07 &amp; T08 &amp; T09 &amp; T10 &amp; T11 &amp; T12 &amp; T13 &amp; T14 &amp; T15 &amp; T17
```

## Wave table

| Wave | Tasks (parallel) | Summary |
|------|------------------|---------|
| 1 | 01 Config &amp; Quality, 02 Event Bus | Shared constants + quality tiers; the pub/sub bus |
| 2 | 03 Grid Math, 04 Renderer, 05 Audio, 06 Leaderboard | Pure grid math; Three renderer; procedural audio; leaderboard |
| 3 | 07 Input, 08 Snake, 09 Arena, 10 Water, 11 Dust, 12 Snake Mesh, 13 Post, 14 HUD, 15 Camera | 9 independent modules (game data + visual systems + UI) |
| 4 | 16 Food | Food spawner (needs water query) |
| 5 | 17 State machine | Orchestration: tick, eat, death, score, bus events |
| 6 | 18 Integration | `index.html` + `js/main.js` wiring + RAF loop |

## Task status

Track progress here. `Implementing`/`Done`/`Blocked` per task.

| # | Task | Wave | File | Status |
|---|------|------|------|--------|
| 01 | Config &amp; Quality Tiers | 1 | [tasks/task-01-config.md](tasks/task-01-config.md) | ✅ Done |
| 02 | Event Bus | 1 | [tasks/task-02-event-bus.md](tasks/task-02-event-bus.md) | ✅ Done |
| 03 | Grid Math | 2 | [tasks/task-03-grid.md](tasks/task-03-grid.md) | ☐ Not started |
| 04 | Renderer | 2 | [tasks/task-04-renderer.md](tasks/task-04-renderer.md) | ☐ Not started |
| 05 | Audio (procedural) | 2 | [tasks/task-05-audio.md](tasks/task-05-audio.md) | ☐ Not started |
| 06 | Leaderboard | 2 | [tasks/task-06-leaderboard.md](tasks/task-06-leaderboard.md) | ☐ Not started |
| 07 | Input | 3 | [tasks/task-07-input.md](tasks/task-07-input.md) | ☐ Not started |
| 08 | Snake (data) | 3 | [tasks/task-08-snake.md](tasks/task-08-snake.md) | ☐ Not started |
| 09 | Arena | 3 | [tasks/task-09-arena.md](tasks/task-09-arena.md) | ☐ Not started |
| 10 | Water Pond | 3 | [tasks/task-10-water.md](tasks/task-10-water.md) | ☐ Not started |
| 11 | Dust Particles | 3 | [tasks/task-11-dust.md](tasks/task-11-dust.md) | ☐ Not started |
| 12 | Snake Mesh | 3 | [tasks/task-12-snake-mesh.md](tasks/task-12-snake-mesh.md) | ☐ Not started |
| 13 | Post-Processing | 3 | [tasks/task-13-post.md](tasks/task-13-post.md) | ☐ Not started |
| 14 | HUD &amp; Menus | 3 | [tasks/task-14-hud.md](tasks/task-14-hud.md) | ☐ Not started |
| 15 | Camera | 3 | [tasks/task-15-camera.md](tasks/task-15-camera.md) | ☐ Not started |
| 16 | Food | 4 | [tasks/task-16-food.md](tasks/task-16-food.md) | ☐ Not started |
| 17 | Game State Machine | 5 | [tasks/task-17-state.md](tasks/task-17-state.md) | ☐ Not started |
| 18 | Integration | 6 | [tasks/task-18-integration.md](tasks/task-18-integration.md) | ☐ Not started |

## Key invariants (cross-task)

- **Bus is the only cross-system channel.** No gameplay/visual module imports
  another directly; they talk through `js/util/eventBus.js`. The single
  exception is `js/main.js` (task-18), the wiring hub.
- **Three.js only in `renderer/`, `post/`, `camera/`.** `game/` and `ui/` are
  Three-free so they stay unit-testable without a GPU context.
- **Grid → world mapping** is centralized in `js/game/grid.js` (W2); every
  module that needs a world position imports `toWorld` from there.
- **Water is shared**: the same `Water` instance is given to both the state
  machine (for `isWater` slow-factor) and the renderer (for visuals), created
  once in `js/main.js`.
- **Quality fan-out** happens only in `js/main.js` (task-18): a tier change
  calls `Renderer.applyQuality` + `Post.setQuality` + `Dust.rebuild`.
