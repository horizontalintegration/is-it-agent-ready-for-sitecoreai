// ─────────────────────────────────────────────────────────────────────────────
// Where history lives: score trends, scan snapshots for "What changed", and
// citation probe runs (plan section 12, decision 2, decided in Phase 8:
// localStorage only, per browser). Everything goes through this interface so
// shared server storage (e.g. Upstash Redis) can replace it later without
// touching the hooks. The API routes have no authentication yet, so a shared
// store would first need it.
// ─────────────────────────────────────────────────────────────────────────────

export interface HistoryStore {
  read<T>(key: string): T | null;
  write(key: string, value: unknown): void;
  remove(key: string): void;
}

/** localStorage. Never throws: blocked storage reads as empty and drops writes. */
export const localHistoryStore: HistoryStore = {
  read<T>(key: string): T | null {
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  },
  write(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // ignore quota errors and blocked storage
    }
  },
  remove(key) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // ignore blocked storage
    }
  },
};

/** An in-memory store, for tests. */
export function memoryHistoryStore(): HistoryStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    read<T>(key: string): T | null {
      const raw = data.get(key);
      return raw ? (JSON.parse(raw) as T) : null;
    },
    write(key, value) {
      data.set(key, JSON.stringify(value));
    },
    remove(key) {
      data.delete(key);
    },
  };
}
