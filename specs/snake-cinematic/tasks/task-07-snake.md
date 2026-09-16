# Task 07: Snake visual system (instanced segments + eyes)
Wave: 4
Depends on: 02, 06
Owns: `js/world/snake.js`, `tests/snake.test.mjs`
Risk: normal (visual; depends on the shared snapshot shape only)
Requirements: R-WORLD-04, R-ARCH-05, R-PERF-04, R-ARCH-01

## Goal
One `InstancedMesh` for the whole snake (head-first instance order, per-instance
gradient color, two head eyes) driven purely from the shared snapshot; zero
per-frame allocations.

## Contract
- Pure (Node-importable):
  - `segMatrix(c, r, direction, isHead)` → `THREE.Matrix4` composing a box of
    size `{w: TILE*0.9, h: 0.55, d: TILE*0.9}` centered at `cellToWorld(c, r)`
    with y = 0.275 (rests on the floor; floor top at y=0). The box is axis-
    aligned (no rotation per segment — the head's eyes convey direction).
  - `segColor(index, count)` → head `#4fd18b` → tail `#1d5c3d` linear
    interpolation in sRGB, normalized to [0,1] linear-ish (use three's
    `Color.lerp` on a preconstructed Color pair — document the exact lerp:
    `t = count <= 1 ? 0 : index / (count - 1)`, head index 0 → bright).
- `class SnakeVisual`:
  - `attach(scene, renderer)` — constructs the `InstancedMesh(count = initial
    length, BoxGeometry(TILE*0.9, 0.55, TILE*0.9), MeshStandardMaterial({
    roughness 0.45, metalness 0.08, envMapIntensity 0.6, vertexColors
    disabled }))` with `instanceColor` buffer sized to the max length
    (`GRID*GRID`, 400) — reallocated only on length growth beyond the current
    instance count, never per frame. `castShadow = true`.
  - `update(snapshot)` (R-ARCH-05 shape): writes instance matrices and colors
    for `snapshot.snake.length` entries in head-first order; `instanceMatrix`
    and `instanceColor` `.needsUpdate = true`, `count = length`. Also positions
    the two eye spheres (child of the head instance's matrix, or a separate
    small `Mesh(SphereGeometry(0.09))` × 2 offset from the head center opposite
    to `snapshot.direction`) — eyes are the **only** non-instanced snake meshes.
  - No `BufferGeometry` / material / texture creation inside `update` (preallocated
    scratch matrices and colors only).
- `js/world/snake.js` must import only `three`, `three/addons/*`, and
  `js/game/core.js` (for `cellToWorld`, `GRID`, `TILE`).

## Acceptance And Verification
Gate: task (wave 4). `tests/snake.test.mjs`:
- `segMatrix(10, 8, dir, true)` → matrix translation equals
  `{x: 0.5, y: 0.275, z: -1.5}` (cell (10,8) → world (0.5, -1.5)); box extents
  in X/Z equal `TILE*0.9` (extract from the matrix column magnitudes).
- `segColor(0, 3)` ≈ `#4fd18b`/255 per channel within 2/255; `segColor(2, 3)`
  ≈ `#1d5c3d` within 2/255; midpoint `segColor(1,3)` is the documented lerp.
- `update` with a length-4 snapshot places 4 instances in head-first order with
  the correct world translations; a second `update` with length-5 does not
  reallocate the geometry (assert `geometry.attributes` unchanged / instance
  buffer capacity ≥ 5 from a test hook or by construction-time constant).
- Eyes: after `update`, exactly 2 additional sphere meshes exist at positions
  offset from the head cell center, on the side opposite `snapshot.direction`
  (e.g. heading north → eyes at +Z relative to head center within ±0.05).
- No per-frame allocation: `update` calls `instanceMatrix.needsUpdate` and
  `instanceColor.needsUpdate` but creates no new `Matrix4`/`Color`/`Vector3`
  beyond a fixed module-level scratch set (assert by wrapping
  `THREE.Matrix4`/`THREE.Color` constructors via a proxy if feasible, else code-
  review note — prefer the proxy so the check is executable).
