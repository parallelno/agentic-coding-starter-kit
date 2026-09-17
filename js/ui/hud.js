// js/ui/hud.js — DOM overlay HUD (Task 11; R-CINE-02, R-ARCH-04, R-ARCH-05).
// Reacts ONLY to engine `state` events (never polls). No engine/world/three
// imports (R-ARCH-01); the pure helpers below are importable under Node with
// no DOM. The Hud class only touches the DOM when constructed with a container.
//
// The overlay show/hide mechanism is the `.visible` class defined in
// js/style.css (task 01): `.overlay { display: none }` / `.overlay.visible {
// display: block }`. Author CSS would override a `[hidden]` UA rule, so a
// single `.visible` class (not the hidden attribute) drives visibility.

const OVERLAY_KEYS = ['menu', 'paused', 'dead', 'won'];

const TITLE = 'SNAKE — Cinematic Edition';
const HINT = 'arrows / WASD to steer · space to start';
const PAUSED_TITLE = 'paused';
const DEAD_TITLE = 'game over';
const WON_TITLE = 'you won!';
const CTA = {
  menu: 'space to start',
  paused: 'space to resume',
  dead: 'space to play again',
  won: 'space to play again',
};

function asDisplay(value) {
  return value != null && value !== '' ? String(value) : '0';
}

/**
 * Pure: the three top-bar stats as `label: value` display strings.
 * Missing number -> "0" value (e.g. `best: 0`).
 *
 * @param {object} evt engine `state` payload `{ ...snapshot, length, best, top }`
 * @returns {{ score: string, length: string, best: string }} e.g. `score: 30`
 */
export function formatHud(evt = {}) {
  return {
    score: `score: ${asDisplay(evt.score)}`,
    length: `length: ${asDisplay(evt.length)}`,
    best: `best: ${asDisplay(evt.best)}`,
  };
}

/** Pull the numeric value out of a `label: value` display string. */
function valueOf(display) {
  const i = display.indexOf(': ');
  return i >= 0 ? display.slice(i + 2) : String(display);
}

/**
 * Pure: describe which overlay to show, its top-3 rows and its CTA.
 * `key` in menu|paused|dead|won (won when evt.won is truthy). `rows` =
 * evt.top.slice(0,3) mapped to "#i. {score}" labels (stable order). `cta`
 * matches the overlay state.
 *
 * Note: for the `playing` state a caller of the DOM layer hides all overlays;
 * the pure function still returns a valid key (falls back to 'dead').
 *
 * @param {object} evt engine `state` payload
 * @returns {{ key: string, rows: string[], cta: string }}
 */
export function overlayFor(evt = {}) {
  const top = Array.isArray(evt.top) ? evt.top : [];
  const rows = top.slice(0, 3).map((e, i) => `#${i + 1}. ${e && e.score != null ? e.score : 0}`);
  const st = evt.state;
  let key;
  if (evt.won) key = 'won';
  else if (st === 'paused') key = 'paused';
  else if (st === 'menu') key = 'menu';
  else key = 'dead'; // 'dead' and 'playing' fall back here (DOM hides on playing)
  return { key, rows, cta: CTA[key] };
}

/**
 * DOM HUD. Builds the top bar + the four overlay blocks + the mute flag ONCE
 * (no per-update DOM creation) and mutates existing nodes on setState/setMuted.
 * Use only classes defined in js/style.css.
 */
export class Hud {
  constructor(container) {
    if (!container) {
      throw new Error('Hud: a container element is required');
    }
    const doc = container.ownerDocument || globalThis.document || null;
    if (!doc || typeof doc.createElement !== 'function') {
      throw new Error('Hud: no DOM available to build the HUD');
    }
    this._muted = false;

    const el = (tag, className, text) => {
      const n = doc.createElement(tag);
      if (className) n.className = className;
      if (text != null) n.textContent = text;
      return n;
    };

    // --- persistent top bar (score / length / best) -------------------------
    const bar = el('div', 'hud-bar');
    const stat = {};
    for (const key of ['score', 'length', 'best']) {
      const group = el('div');
      group.appendChild(el('span', 'stat-label', key));
      const value = el('span', null, '0');
      group.appendChild(value);
      bar.appendChild(group);
      stat[key] = value;
    }
    container.appendChild(bar);

    // --- state overlays (created once) --------------------------------------
    const overlays = {};

    const menu = el('div', 'overlay menu');
    menu.appendChild(el('h1', null, TITLE));
    menu.appendChild(el('p', null, HINT));
    menu.appendChild(el('p', null, CTA.menu));
    container.appendChild(menu);
    overlays.menu = menu;

    const paused = el('div', 'overlay paused');
    paused.appendChild(el('h1', null, PAUSED_TITLE));
    paused.appendChild(el('p', null, CTA.paused));
    container.appendChild(paused);
    overlays.paused = paused;

    const dead = el('div', 'overlay dead');
    dead.appendChild(el('h1', null, DEAD_TITLE));
    const deadFinal = el('p', null, 'score 0');
    dead.appendChild(deadFinal);
    const deadBoard = el('div', 'board');
    const deadRows = [];
    for (let i = 0; i < 3; i++) {
      const p = el('p', null, '');
      deadBoard.appendChild(p);
      deadRows.push(p);
    }
    dead.appendChild(deadBoard);
    dead.appendChild(el('p', null, CTA.dead));
    container.appendChild(dead);
    overlays.dead = dead;

    const won = el('div', 'overlay won');
    won.appendChild(el('h1', null, WON_TITLE));
    const wonBoard = el('div', 'board');
    const wonRows = [];
    for (let i = 0; i < 3; i++) {
      const p = el('p', null, '');
      wonBoard.appendChild(p);
      wonRows.push(p);
    }
    won.appendChild(wonBoard);
    won.appendChild(el('p', null, CTA.won));
    container.appendChild(won);
    overlays.won = won;

    // --- mute indicator (hidden until muted) -------------------------------
    const muteFlag = el('span', 'mute-flag', 'muted');
    muteFlag.hidden = true;
    container.appendChild(muteFlag);

    this._stat = stat;
    this._overlays = overlays;
    this._deadBoard = deadRows;
    this._wonBoard = wonRows;
    this._deadFinal = deadFinal;
    this._muteFlag = muteFlag;
  }

  /** Refresh existing nodes from a `state` event payload. No DOM creation. */
  setState(evt = {}) {
    const hud = formatHud(evt);
    this._stat.score.textContent = valueOf(hud.score);
    this._stat.length.textContent = valueOf(hud.length);
    this._stat.best.textContent = valueOf(hud.best);

    const { key, rows } = overlayFor(evt);
    this._fillBoard(this._deadBoard, rows);
    this._fillBoard(this._wonBoard, rows);
    this._deadFinal.textContent = hud.score;

    // playing -> no overlay; otherwise the single matching overlay.
    const active = evt.state === 'playing' ? null : key;
    for (const k of OVERLAY_KEYS) {
      this._overlays[k].classList.toggle('visible', k === active);
    }
  }

  /** Reflect mute on the `.mute-flag` node (no per-call DOM creation). */
  setMuted(muted) {
    this._muted = !!muted;
    this._muteFlag.hidden = !this._muted;
    this._muteFlag.textContent = this._muted ? 'muted' : '';
  }

  _fillBoard(board, rows) {
    for (let i = 0; i < board.length; i++) {
      board[i].textContent = i < rows.length ? rows[i] : '';
    }
  }
}
