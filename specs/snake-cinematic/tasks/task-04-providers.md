# Task 04: Providers (rng, leaderboard, quality)
Wave: 1
Depends on: none
Owns: `js/providers/rng.js`, `js/providers/leaderboard.js`, `js/providers/quality.js`,
`tests/providers.test.mjs`
Risk: normal
Requirements: R-CORE-06 (leaderboard semantics), R-PERF-01, R-ARCH-03, R-ARCH-06

## Goal
Injectable, browser-guarded provider implementations with deterministic test doubles.

## Contract
- `js/providers/rng.js`: exports `seededRng(seed)` → mulberry32 PRNG returning
  `() => number in [0,1)`; deterministic first values for known seeds (document the
  first 3 outputs for seed 1 as test oracle). Export `defaultRng()` → `Math.random`.
- `js/providers/leaderboard.js`: `createLeaderboard({ storage })`:
  - `submit(score)` appends, sorts descending, trims to top 10; ties keep
    insertion order (stable sort on the raw list before slice).
  - `list()` → array of `{score, at: number}` (at = Date.now() ms at submit;
    injectable clock `{ now }` for tests, default `Date.now`).
  - `best()` → `list()[0].score || 0`.
  - Default storage = guarded `globalThis.localStorage` with key `snake_scores`
    (JSON array of `score` numbers); any throw (access/deserialize) → in-memory
    fallback array. Explicit `storage` injection: `{ load(), save(json) }` shape;
    a throwing injected storage must fall back to memory without breaking `submit`.
- `js/providers/quality.js`:
  - `MOBILE_RE = /Android|iPhone|iPad|Mobile/i`; `isMobileUA(ua)` predicate.
  - `pickQuality({ param, stored, isMobile })` → precedence:
    `param` (if one of `low`/`standard`/`high`) > `stored` (if valid) >
    `isMobile ? 'low' : 'standard'`; invalid param/stored values fall through.
  - `tierConfig(tier)` → exact map per R-PERF-01:
    `{ low: {pixelRatio:1, dust:80, composer:false, shadows:1024},
       standard:{pixelRatio:1.5, dust:240, composer:'smaa', shadows:2048},
       high:{pixelRatio:2, dust:500, composer:'smaa+bloom', shadows:2048} }`.
- All three modules: no DOM access at import time; browser globals only via
  `globalThis` guards so Node import never throws.

## Acceptance And Verification
Gate: task (wave 1). `tests/providers.test.mjs`:
- `seededRng(1)` first 3 outputs equal the documented oracle; two instances equal;
  values in [0,1).
- Leaderboard: submit 5 mixed scores → top-3 order correct; 12 submits → length 10;
  two equal scores preserve insertion order; throwing injected storage → in-memory
  fallback still serves subsequent submits; default-storage path in Node (no
  `localStorage`) constructs cleanly (guarded).
- `pickQuality` precedence table: param wins over stored; valid stored wins over
  mobile; invalid param falls to stored/mobile; mobile default `low`, desktop
  default `standard`.
- `tierConfig` deep-equals the map above for all three tiers; unknown tier throws.
