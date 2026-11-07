import { Redis } from '@upstash/redis';
import { type Cache, type CacheEntry, type CacheSetOptions, makeEntry } from './types';

const entryShape = (v: unknown): v is CacheEntry<unknown> =>
  typeof v === 'object' &&
  v !== null &&
  'value' in v &&
  typeof (v as { freshUntil?: unknown }).freshUntil === 'number' &&
  typeof (v as { swrUntil?: unknown }).swrUntil === 'number';

/**
 * Upstash Redis cache. Redis errors never break a request: reads degrade to a miss and
 * writes are best-effort (the chain then just calls providers / seed).
 */
export class UpstashCache implements Cache {
  readonly backend = 'upstash' as const;
  constructor(private redis: Redis, private prefix = 'overlap:') {}

  static fromEnv(env: NodeJS.ProcessEnv = process.env): UpstashCache | null {
    const url = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL;
    const token = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN;
    if (!url || !token) return null;
    return new UpstashCache(new Redis({ url, token }));
  }

  private k(key: string) {
    return this.prefix + key;
  }

  async get<T>(key: string): Promise<CacheEntry<T> | null> {
    try {
      const v = await this.redis.get<unknown>(this.k(key));
      return entryShape(v) ? (v as CacheEntry<T>) : null;
    } catch {
      return null;
    }
  }

  async set<T>(key: string, value: T, opts: CacheSetOptions, now = Date.now()): Promise<void> {
    const { entry, keepSeconds } = makeEntry(value, opts, now);
    await this.put(key, entry, keepSeconds);
  }

  async put<T>(key: string, entry: CacheEntry<T>, keepSeconds: number): Promise<void> {
    try {
      await this.redis.set(this.k(key), entry, { ex: Math.max(1, Math.ceil(keepSeconds)) });
    } catch {
      /* best effort */
    }
  }

  async incr(key: string, by: number, ttlSeconds: number): Promise<number> {
    const k = this.k(key);
    const n = await this.redis.incrby(k, by);
    if (n === by) await this.redis.expire(k, Math.max(1, Math.ceil(ttlSeconds)));
    return n;
  }

  async getCounter(key: string): Promise<number> {
    try {
      const v = await this.redis.get<unknown>(this.k(key));
      const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : 0;
      return Number.isFinite(n) ? n : 0;
    } catch {
      return 0;
    }
  }
}
