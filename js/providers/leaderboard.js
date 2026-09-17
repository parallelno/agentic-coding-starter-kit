// SNAKE — Cinematic Edition: leaderboard provider (injectable storage).
// Storage shape: { load(): string|null, save(json: string): void }.
// The persisted document is a JSON array of { score, at } records (top 10,
// descending). Any access/parse/save throw falls back to an in-memory array so
// submit() never breaks.

const KEY = 'snake_scores';

function inNode() {
  return typeof globalThis === 'undefined' || !globalThis.localStorage;
}

function resolveDefaultStorage() {
  if (inNode()) return null; // pure in-memory under Node (guarded, no throw)
  const ls = globalThis.localStorage;
  return {
    load: () => ls.getItem(KEY),
    save: (json) => ls.setItem(KEY, json),
  };
}

function sanitizeParsed(raw) {
  if (!raw) return [];
  const arr = JSON.parse(raw);
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((x) => x && typeof x.score === 'number')
    .map((x) => ({ score: x.score, at: typeof x.at === 'number' ? x.at : 0 }));
}

export function createLeaderboard({ storage, now = Date.now } = {}) {
  let records = [];
  const store = storage !== undefined ? storage : resolveDefaultStorage();
  let broken = false; // storage proved un-usable -> memory only from now on

  // Initial load.
  if (store) {
    try {
      records = sanitizeParsed(store.load());
    } catch {
      broken = true; // fall back to memory
    }
  }

  function persist() {
    if (!store || broken) return;
    try {
      store.save(JSON.stringify(records));
    } catch {
      broken = true; // silently drop to memory
      return;
    }
  }

  function submit(score) {
    records.push({ score, at: now() });
    // Stable sort, descending. Ties keep insertion order (ES2019+ Array.sort
    // is stable), so equal scores preserve the order they were submitted in.
    records.sort((a, b) => b.score - a.score);
    if (records.length > 10) records.length = 10; // trim to top 10
    persist();
  }

  function list() {
    return records.map((r) => ({ score: r.score, at: r.at }));
  }

  function best() {
    const top = list()[0];
    return (top && top.score) || 0;
  }

  return { submit, list, best };
}
