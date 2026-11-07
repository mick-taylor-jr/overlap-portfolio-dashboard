import { MemoryCache } from './memory';
import { UpstashCache } from './upstash';
import type { Cache } from './types';

export * from './types';
export { MemoryCache } from './memory';
export { UpstashCache } from './upstash';
export { SingleFlight, singleflight } from './singleflight';
export { AlphaVantageBudget, type BudgetStatus, type BudgetDecision } from './budget';
export { CircuitBreaker, type CircuitState } from './breaker';
export { withRetry, withTimeout, isRetryable, type RetryOptions } from './resilience';
export * from './ttl';

let instance: Cache | null = null;

/** Upstash when UPSTASH_REDIS_REST_URL/TOKEN (or Vercel KV_REST_API_*) are set, else in-memory LRU. */
export function getCache(): Cache {
  if (!instance) instance = UpstashCache.fromEnv() ?? new MemoryCache();
  return instance;
}

/** Test hook. */
export function setCacheForTests(c: Cache | null): void {
  instance = c;
}
