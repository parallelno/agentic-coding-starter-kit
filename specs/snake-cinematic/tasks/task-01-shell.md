# Task 01: Project shell HTML and style
Wave: 1
Depends on: none
Owns: `index.html`, `js/style.css`, `tests/shell.test.mjs`
Risk: normal (foundation; everything else imports these paths)
Requirements: R-SCOPE-01, R-SCOPE-02, R-ARCH-01, R-ARCH-06, R-CINE-02 (style only)

## Goal
The thin HTML shell and shared stylesheet exist so later tasks have stable paths.
`package.json` and `tests/shell.test.mjs` were pre-created by the planning harness
(already in the repo) — do not recreate them; do fix them if a test proves their
content wrong.

## Contract
- `package.json` (already present): `{ "name": "snake-cinematic", "private": true,
  "type": "module", "scripts": { "test": "node --test \"tests/*.test.mjs\"" } }`.
- `index.html`: `<canvas id="game">`, HUD container `<div id="hud">`, and exactly one
  module script tag `<script type="module" src="js/main.js"></script>`. No inline JS.
  `main.js` may not exist yet in this task — do not guard against it; task 13 creates it.
- `js/style.css`: dark translucent panels for HUD/overlays (background
  `rgba(12,16,20,0.72)`, `border-radius: 10px`, padding 12-16px), system font stack,
  canvas `display:block` filling the viewport, overlay classes: `.hud-bar`,
  `.overlay.menu/.paused/.dead/.won`, `.mute-flag`. No external fonts/stylesheets.
- `tests/shell.test.mjs` (pure-Node, no DOM library; two named `node:test`
  blocks with `assert/strict`). NOTE: this file already exists in the repo at
  planning time as part of the test harness (owned here, verified green except
  that `index.html` does not yet exist — the `index.html` test block is the
  expected RED until this task creates `index.html`; the `package.json` block
  is green at planning time). Do not rewrite it; do fix it if a test proves
  its content wrong:
  - `package.json` parses, `"type" === "module"`, `scripts.test` runs
    `node --test` over `tests/`
  - `index.html` contains the canvas, `#hud`, and the single module script line; no
    `<script` tag other than the module tag; no inline JS.

## Acceptance And Verification
Gate: task (wave 1).
- Run `npm test`. Expect both shell assertions green.
- (Wave/final visual: page loads blank-with-HUD only after task 13; nothing to render here.)
