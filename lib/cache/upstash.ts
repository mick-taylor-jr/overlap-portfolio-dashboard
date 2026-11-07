import { Redis } from '@upstash/redis';
import { type Cache, type CacheEntry, type CacheSetOptions, makeEntry } from './types';

export interface UpstashEnv {
  url: string;
  token: string;
  /** Variable prefix the credentials were read from, e.g. 'UPSTASH_REDIS', 'KV', 'STORAGE'. */
  prefix: string;
}

/**
 * Find Upstash REST credentials. Order: UPSTASH_REDIS_REST_URL/TOKEN, KV_REST_API_URL/TOKEN, then
 * any <PREFIX>_REST_API_URL with a matching <PREFIX>_REST_API_TOKEN (Vercel Marketplace custom
 * prefixes, default 'STORAGE'). The read-only token is never used (cache writes and budget counters
 * need write access). Values are never logged or returned outside this object.
 */
export function resolveUpstashEnv(env: NodeJS.ProcessEnv = process.env): UpstashEnv | null {
  const pick = (prefix: string, urlVar: string, tokenVar: string): UpstashEnv | null => {
    const url = env[urlVar]?.trim();
    const token = env[tokenVar]?.trim();
    return url && token ? { url, token, prefix } : null;
  };
  const direct = pick('UPSTASH_REDIS', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN') ?? pick('KV', 'KV_REST_API_URL', 'KV_REST_API_TOKEN');
  if (direct) return direct;
  const prefixes = Object.keys(env)
    .map((k) => /^(\w+)_REST_API_URL$/.exec(k)?.[1])
    .filter((p): p is string => Boolean(p) && p !== 'KV')
    .sort();
  for (const prefix of prefixes) {
    const found = pick(prefix, `${prefix}_REST_API_URL`, `${prefix}_REST_API_TOKEN`);
    if (found) return found;
  }
  return null;
}

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
  constructor(private redis: Redis, private prefix = 'overlap:', readonly envPrefix?: string) {}

  static fromEnv(env: NodeJS.ProcessEnv = process.env): UpstashCache | null {
    const found = resolveUpstashEnv(env);
    if (!found) return null;
    return new UpstashCache(new Redis({ url: found.url, token: found.token }), 'overlap:', found.prefix);
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
