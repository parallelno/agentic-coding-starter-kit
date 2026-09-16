const KEY = 'snake-cinematic:leaderboard';
const MAX = 10;

export class LeaderboardProvider {
  // interface (doc only)
  async top(n) {
    throw new Error('not implemented');
  }
  async add(score, name) {
    throw new Error('not implemented');
  }
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
      // quota/privacy mode: ignore
    }
  }

  async top(n = 10) {
    const l = this._read().slice().sort((a, b) => b.score - a.score);
    return l.slice(0, n);
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
