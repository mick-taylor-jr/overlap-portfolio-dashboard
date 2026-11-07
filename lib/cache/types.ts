/**
 * Server-side cache contracts. Entries carry freshness metadata so callers can implement
 * stale-while-revalidate and "last cached value" fallbacks:
 *   now < freshUntil              -> fresh, serve as-is
 *   freshUntil <= now < swrUntil  -> serve immediately, refresh in the background
 *   swrUntil <= now (still kept)  -> only used as a fallback when every live provider fails
 * The store itself drops the entry after `keepSeconds`.
 */
export interface CacheEntry<T> {
  value: T;
  storedAt: number; // epoch ms
  freshUntil: number; // epoch ms
  swrUntil: number; // epoch ms
  /** Set when a background refresh failed; subsequent reads should mark data stale. */
  refreshFailedAt?: number;
}

export interface CacheSetOptions {
  /** Seconds the value is considered fresh. */
  ttlSeconds: number;
  /** Extra seconds after ttl during which the value is served while revalidating. Default = ttlSeconds. */
  swrSeconds?: number;
  /** Seconds the store keeps the entry at all (for last-cached fallback). Default = ttl + swr. */
  keepSeconds?: number;
}

export type CacheBackend = 'upstash' | 'memory';

export interface Cache {
  readonly backend: CacheBackend;
  /** Env var prefix the backend's credentials came from (name only, never a value). */
  readonly envPrefix?: string;
  get<T>(key: string): Promise<CacheEntry<T> | null>;
  set<T>(key: string, value: T, opts: CacheSetOptions, now?: number): Promise<void>;
  /** Overwrite an existing entry verbatim (used to flag refresh failures). */
  put<T>(key: string, entry: CacheEntry<T>, keepSeconds: number): Promise<void>;
  /** Atomic counter increment; sets expiry on the key. Returns the new value. */
  incr(key: string, by: number, ttlSeconds: number): Promise<number>;
  /** Read a counter (0 when missing). */
  getCounter(key: string): Promise<number>;
}

export function makeEntry<T>(value: T, opts: CacheSetOptions, now: number): { entry: CacheEntry<T>; keepSeconds: number } {
  const swr = opts.swrSeconds ?? opts.ttlSeconds;
  const keepSeconds = Math.max(opts.keepSeconds ?? opts.ttlSeconds + swr, opts.ttlSeconds + swr);
  return {
    entry: {
      value,
      storedAt: now,
      freshUntil: now + opts.ttlSeconds * 1000,
      swrUntil: now + (opts.ttlSeconds + swr) * 1000,
    },
    keepSeconds,
  };
}

export type Freshness = 'fresh' | 'revalidate' | 'expired';

export function freshness(entry: CacheEntry<unknown>, now: number): Freshness {
  if (now < entry.freshUntil) return 'fresh';
  if (now < entry.swrUntil) return 'revalidate';
  return 'expired';
}
