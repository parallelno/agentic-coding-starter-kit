# Task 06 — Leaderboard (provider + localStorage)

- **Wave:** 2
- **Files to create:** `js/ui/leaderboard.js`
- **Depends on:** nothing (self-contained; `localStorage` only).

## Description

A local, offline leaderboard behind a small provider interface so it could later
be swapped for a remote implementation without touching UI. Ships the
`LocalStorageLeaderboard` implementation. Persisted to
`localStorage['snake-cinematic:leaderboard']`, sorted descending by score,
capped at 10 entries.

## Technical spec

```js
const KEY = 'snake-cinematic:leaderboard';
const MAX = 10;

export class LeaderboardProvider { // interface (doc only)
  async top(n) { throw new Error('not implemented'); }
  async add(score, name) { throw new Error('not implemented'); }
}

export class LocalStorageLeaderboard extends LeaderboardProvider {
  constructor(key = KEY) { this.key = key; }
  _read() { try { return JSON.parse(localStorage.getItem(this.key) || '[]'); }
            catch { return []; } }
  _write(list) { try { localStorage.setItem(this.key, JSON.stringify(list)); }
                 catch { /* quota/privacy mode: ignore */ } }
  async top(n = 10) { const l = this._read().sort((a,b)=>b.score-a.score);
                      return l.slice(0, n); }
  async add(score, name = 'PLAYER') {
    const list = this._read();
    list.push({ score, name, ts: Date.now() });
    list.sort((a,b)=>b.score-a.score);
    const next = list.slice(0, MAX);
    this._write(next);
    return next[0];
  }
  static fromStorage() { return new LocalStorageLeaderboard(); }
}
export function createLeaderboard() { return new LocalStorageLeaderboard(); }
```

- Methods are `async` (interface uses Promises) but resolve synchronously.
- Guard all `localStorage` access with try/catch (private-browsing / quota).
- Return entries always as `{ score, name, ts }`.

## Acceptance criteria
- `add(120,'AL')` then `top(5)` returns the new entry first.
- Sorting is stable descending; capping at 10 drops the lowest.
- Corrupted JSON in storage is treated as empty (no throw).
- `localStorage` disabled (throw) → methods resolve gracefully (empty / last).
- `add` resolves to the entry that would become top (the just-added entry if it
  is the highest, else the current top).
