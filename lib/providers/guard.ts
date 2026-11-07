import { CircuitBreaker } from '@/lib/cache/breaker';
import { withRetry, withTimeout, isRetryable } from '@/lib/cache/resilience';
import type { ProviderName } from './env';

const breakers = new Map<ProviderName, CircuitBreaker>();

export function breakerFor(name: ProviderName): CircuitBreaker {
  let b = breakers.get(name);
  if (!b) {
    b = new CircuitBreaker(name, { threshold: 3, cooldownMs: 30_000 });
    breakers.set(name, b);
  }
  return b;
}

export function resetBreakersForTests(): void {
  breakers.clear();
}

export interface GuardOptions {
  timeoutMs?: number;
  retries?: number;
  shouldRetry?: (err: unknown) => boolean;
  sleep?: (ms: number) => Promise<void>;
}

/** breaker( retry( timeout(fn) ) ): one breaker failure per exhausted retry sequence. */
export function guarded<T>(name: ProviderName, fn: (signal: AbortSignal) => Promise<T>, opts: GuardOptions = {}): Promise<T> {
  return breakerFor(name).exec(() =>
    withRetry(() => withTimeout(name, fn, opts.timeoutMs ?? 5000), {
      retries: opts.retries ?? 2,
      shouldRetry: opts.shouldRetry ?? isRetryable,
      sleep: opts.sleep,
    }),
  );
}
