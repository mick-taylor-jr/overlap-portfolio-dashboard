import { MemoryCache } from './memory';
import { UpstashCache } from './upstash';
import type { Cache } from './types';

export * from './types';
export { MemoryCache } from './memory';
export { UpstashCache, resolveUpstashEnv, type UpstashEnv } from './upstash';
export { SingleFlight, singleflight } from './singleflight';
export { AlphaVantageBudget, type BudgetStatus, type BudgetDecision } from './budget';
export { CircuitBreaker, type CircuitState } from './breaker';
export { withRetry, withTimeout, isRetryable, type RetryOptions } from './resilience';
export * from './ttl';

let instance: Cache | null = null;

/** Upstash when credentials are found (see resolveUpstashEnv: UPSTASH_REDIS_*, KV_*, <PREFIX>_REST_API_*), else in-memory LRU. */
export function getCache(): Cache {
  if (!instance) instance = UpstashCache.fromEnv() ?? new MemoryCache();
  return instance;
}

/** Test hook. */
export function setCacheForTests(c: Cache | null): void {
  instance = c;
}
