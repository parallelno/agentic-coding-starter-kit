// T11 (HUD) — a DOM overlay driven purely by engine `state`/`mute` events
// (R-ARCH-04). Pure logic (`formatHud`, `overlayFor`) is exported for Node
// tests; the `Hud` class builds its nodes ONCE at construction and only
// mutates them per update (no per-frame DOM creation, R-PERF-04). Uses only
// classes from js/style.css. Imports nothing from engine/world/three (R-ARCH-01).

const OVERLAY_KEYS = ['menu', 'paused', 'dead', 'won'];

// Pure: display strings from a state event (snapshot fields + length + best).
// Missing best/top -> 0 / empty.
export function formatHud(evt) {
  const e = evt || {};
  const score = Number.isFinite(e.score) ? e.score : 0;
  const length = Number.isFinite(e.length) ? e.length : 0;
  const best = Number.isFinite(e.best) ? e.best : 0;
  return {
    score: `score: ${score}`,
    length: `length: ${length}`,
    best: `best: ${best}`
  };
}

// Pure: the overlay model `{ key, title, rows, cta }`. `key` in
// menu|paused|dead|won (won when evt.won). rows = top-3 `#{i+1}. {score}`.
export function overlayFor(evt) {
  const e = evt || {};
  const won = e.won === true || e.state === 'won';
  let key;
  let title;
  let cta;
  if (won) {
    key = 'won';
    title = 'You won';
    cta = 'space to play again';
  } else if (e.state === 'paused') {
    key = 'paused';
    title = 'Paused';
    cta = 'space to resume';
  } else if (e.state === 'dead') {
    key = 'dead';
    title = 'You died';
    cta = 'space to play again';
  } else {
    key = 'menu';
    title = 'SNAKE';
    cta = 'space to start';
  }
  const top = Array.isArray(e.top) ? e.top : [];
  const rows = top.slice(0, 3).map((row, i) => `#${i + 1}. ${row ? row.score : 0}`);
  return { key, title, rows, cta };
}

// DOM HUD. Nodes are created once in the constructor; setState/setMuted only
// mutate text/visibility on the cached nodes.
export class Hud {
  constructor(container) {
    this.root = container;
    this._makeStatBar();
    this._makeOverlays();
    this._makeMuteFlag();
  }

  _el(tag, className, text) {
    const n = document.createElement(tag);
    if (className) n.className = className;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  _makeStatBar() {
    const bar = this._el('div', 'hud-bar');
    this._statValues = {};
    for (const key of ['score', 'length', 'best']) {
      const stat = this._el('div', 'stat');
      stat.append(
        this._el('span', 'label', key),
        this._el('span', 'value', '0')
      );
      const value = stat.lastElementChild;
      bar.append(stat);
      this._statValues[key] = value;
    }
    this._statBar = bar;
    this.root.append(bar);
  }

  _makeOverlays() {
    this._overlays = {};
    for (const key of OVERLAY_KEYS) {
      const el = this._el('div', `overlay ${key}`);
      const panel = this._el('div', 'panel');
      const title = this._el('div', 'title');
      const rows = this._el('div', 'rows');
      // Preallocate up to 3 row slots so setState never creates DOM nodes.
      const rowNodes = [];
      for (let i = 0; i < 3; i++) {
        const rn = this._el('div');
        rn.style.display = 'none';
        rows.append(rn);
        rowNodes.push(rn);
      }
      const cta = this._el('div', 'cta');
      panel.append(title, rows, cta);
      el.append(panel);
      el.classList.add('hidden');
      this.root.append(el);
      this._overlays[key] = { el, title, rows, rowNodes, cta };
    }
  }

  _makeMuteFlag() {
    this._muteFlag = this._el('div', 'mute-flag', 'MUTED');
    this._muteFlag.classList.add('hidden');
    this.root.append(this._muteFlag);
  }

  // Refresh from a state event. Mutates only the cached nodes.
  setState(evt) {
    const e = evt || {};
    this._statValues.score.textContent = String(Number.isFinite(e.score) ? e.score : 0);
    this._statValues.length.textContent = String(Number.isFinite(e.length) ? e.length : 0);
    this._statValues.best.textContent = String(Number.isFinite(e.best) ? e.best : 0);

    const playing = (evt && evt.state) === 'playing';
    for (const key of OVERLAY_KEYS) this._overlays[key].el.classList.add('hidden');
    if (playing) return;

    const m = overlayFor(evt);
    const o = this._overlays[m.key];
    o.title.textContent = m.title;
    o.cta.textContent = m.cta;
    for (let i = 0; i < 3; i++) {
      const rn = o.rowNodes[i];
      if (i < m.rows.length) {
        rn.textContent = m.rows[i];
        rn.style.display = '';
      } else {
        rn.style.display = 'none';
      }
    }
    o.el.classList.remove('hidden');
  }

  setMuted(muted) {
    this._muteFlag.classList.toggle('hidden', !muted);
  }
}

export function createHud(container) {
  return new Hud(container);
}
