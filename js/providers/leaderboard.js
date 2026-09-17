// js/providers/leaderboard.js — persistent top-10 score board (T04).
//
// No DOM access at import. `globalThis.localStorage` is only touched inside
// guarded closures at call time, so Node import is always safe.

const KEY = 'snake_scores';
const MAX = 10;

// Build the default storage adapter on top of guarded globalThis.localStorage.
// Every access is throw-guarded; on any failure we fall back to memory in the
// caller (see createLeaderboard).
function defaultStorage() {
  return {
    load() {
      const ls = globalThis.localStorage;
      if (!ls) return null; // no storage (e.g. Node) -> memory
      const raw = ls.getItem(KEY);
      if (raw == null) return null;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return null;
      return parsed;
    },
    save(json) {
      const ls = globalThis.localStorage;
      if (!ls) return;
      ls.setItem(KEY, json);
    },
  };
}

/**
 * @param {object} opts
 * @param {{load(): any, save(json: string): void}} [opts.storage]
 *   Explicit storage adapter (R-CORE-06). Throws fall back to memory.
 * @param {number[]} [opts.initial]
 *   Seed scores (numeric) used to initialize the board.
 * @param {{now(): number}} [opts.clock]
 *   Injectable clock for entry timestamps; defaults to Date.now.
 */
export function createLeaderboard({ storage, initial, clock } = {}) {
  const store = storage || defaultStorage();
  const now = (clock && typeof clock.now === 'function' && clock.now) || Date.now;

  // Load existing scores (numeric list), else the seed, else empty.
  let entries;
  try {
    const raw = store.load();
    if (Array.isArray(raw)) {
      entries = raw
        .filter((n) => typeof n === 'number' && Number.isFinite(n))
        .map((score) => ({ score, at: now() }));
    } else {
      entries = (initial || []).map((score) => ({ score, at: now() }));
    }
  } catch {
    entries = (initial || []).map((score) => ({ score, at: now() }));
  }

  let persistBroken = false;

  function persist() {
    if (persistBroken) return; // already fell back to memory
    try {
      store.save(JSON.stringify(entries.map((e) => e.score)));
    } catch {
      persistBroken = true; // storage threw; keep serving from memory
    }
  }

  // Stable desc sort on the raw list (score desc, then original index), then
  // slice to the top 10. Index tie-break makes ties keep insertion order
  // regardless of engine sort stability.
  function ordered() {
    return entries
      .map((e, i) => ({ ...e, i }))
      .sort((a, b) => b.score - a.score || a.i - b.i)
      .slice(0, MAX)
      .map(({ score, at }) => ({ score, at }));
  }

  return {
    submit(score) {
      entries.push({ score: Number(score), at: now() });
      persist();
      return this.best();
    },
    list() {
      return ordered();
    },
    best() {
      const l = ordered();
      return l.length ? l[0].score : 0;
    },
  };
}
