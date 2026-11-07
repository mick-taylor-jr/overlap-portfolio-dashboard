import { LRUCache } from 'lru-cache';
import { type Cache, type CacheEntry, type CacheSetOptions, makeEntry } from './types';

type Stored = { entry: CacheEntry<unknown> } | { counter: number };

/** In-process LRU fallback. Per serverless instance only; fine for local dev and as a backstop. */
export class MemoryCache implements Cache {
  readonly backend = 'memory' as const;
  private lru: LRUCache<string, Stored>;

  constructor(max = 5000) {
    this.lru = new LRUCache<string, Stored>({ max, ttlAutopurge: false });
  }

  async get<T>(key: string): Promise<CacheEntry<T> | null> {
    const v = this.lru.get(key);
    if (!v || !('entry' in v)) return null;
    return v.entry as CacheEntry<T>;
  }

  async set<T>(key: string, value: T, opts: CacheSetOptions, now = Date.now()): Promise<void> {
    const { entry, keepSeconds } = makeEntry(value, opts, now);
    this.lru.set(key, { entry }, { ttl: keepSeconds * 1000 });
  }

  async put<T>(key: string, entry: CacheEntry<T>, keepSeconds: number): Promise<void> {
    this.lru.set(key, { entry }, { ttl: Math.max(1, keepSeconds) * 1000 });
  }

  async incr(key: string, by: number, ttlSeconds: number): Promise<number> {
    const cur = this.lru.get(key);
    const n = (cur && 'counter' in cur ? cur.counter : 0) + by;
    // Keep the original expiry when the key already exists (mirrors Redis INCRBY semantics).
    const remaining = cur ? this.lru.getRemainingTTL(key) : 0;
    const ttl = cur && remaining > 0 && Number.isFinite(remaining) ? remaining : ttlSeconds * 1000;
    this.lru.set(key, { counter: n }, { ttl });
    return n;
  }

  async getCounter(key: string): Promise<number> {
    const cur = this.lru.get(key);
    return cur && 'counter' in cur ? cur.counter : 0;
  }

  clear(): void {
    this.lru.clear();
  }
}
