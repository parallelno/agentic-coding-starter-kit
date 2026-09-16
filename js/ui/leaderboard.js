// Local, offline leaderboard behind a provider interface so it can later be
// swapped for a remote implementation without touching the UI.
// Entries are always `{ score, name, ts }`.

const KEY = 'snake-cinematic:leaderboard';
const MAX = 10;

// Interface (doc only). Concrete providers extend this.
export class LeaderboardProvider {
  async top() { throw new Error('not implemented'); }
  async add() { throw new Error('not implemented'); }
}

export class LocalStorageLeaderboard extends LeaderboardProvider {
  constructor(key = KEY) {
    super();
    this.key = key;
  }

  _read() {
    try {
      return JSON.parse(localStorage.getItem(this.key) || '[]');
    } catch {
      return [];
    }
  }

  _write(list) {
    try {
      localStorage.setItem(this.key, JSON.stringify(list));
    } catch {
      /* quota/privacy mode: ignore */
    }
  }

  async top(n = 10) {
    const list = this._read().sort((a, b) => b.score - a.score);
    return list.slice(0, n);
  }

  async add(score, name = 'PLAYER') {
    const list = this._read();
    list.push({ score, name, ts: Date.now() });
    list.sort((a, b) => b.score - a.score);
    const next = list.slice(0, MAX);
    this._write(next);
    return next[0];
  }

  static fromStorage() {
    return new LocalStorageLeaderboard();
  }
}

export function createLeaderboard() {
  return new LocalStorageLeaderboard();
}
