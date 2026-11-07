import { ProviderError } from '@/lib/providers/types';

/** Has an HTTP status (our HttpProviderError, or any error-like object exposing `status`). */
function statusOf(err: unknown): number | undefined {
  if (typeof err === 'object' && err !== null && 'status' in err) {
    const s = (err as { status: unknown }).status;
    return typeof s === 'number' ? s : undefined;
  }
  return undefined;
}

/**
 * Default retry policy: retry timeouts, network errors, 5xx and 429. Never retry other 4xx,
 * not_found, invalid_response, budget_exhausted or circuit_open.
 */
export function isRetryable(err: unknown): boolean {
  const status = statusOf(err);
  if (status !== undefined) return status === 429 || status >= 500;
  if (err instanceof ProviderError) {
    return err.kind === 'timeout' || err.kind === 'unavailable' || err.kind === 'rate_limited';
  }
  return true; // unknown / network errors (TypeError: fetch failed, ECONNRESET, ...)
}

export interface RetryOptions {
  retries?: number; // max retries AFTER the first attempt (default 2)
  baseMs?: number;
  maxMs?: number;
  shouldRetry?: (err: unknown) => boolean;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Exponential backoff with full jitter: delay = random * min(maxMs, baseMs * 2^attempt). */
export async function withRetry<T>(fn: (attempt: number) => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const retries = Math.min(opts.retries ?? 2, 2);
  const baseMs = opts.baseMs ?? 250;
  const maxMs = opts.maxMs ?? 2000;
  const shouldRetry = opts.shouldRetry ?? isRetryable;
  const sleep = opts.sleep ?? realSleep;
  const random = opts.random ?? Math.random;
  let attempt = 0;
  for (;;) {
    try {
      return await fn(attempt);
    } catch (err) {
      if (attempt >= retries || !shouldRetry(err)) throw err;
      const cap = Math.min(maxMs, baseMs * 2 ** attempt);
      await sleep(Math.round(random() * cap));
      attempt += 1;
    }
  }
}

/**
 * Run `fn` with an AbortSignal that fires after `ms`. Rejects with ProviderError('timeout')
 * even if `fn` ignores the signal.
 */
export async function withTimeout<T>(provider: string, fn: (signal: AbortSignal) => Promise<T>, ms = 5000): Promise<T> {
  const ac = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      ac.abort();
      reject(new ProviderError(provider, `timed out after ${ms}ms`, 'timeout'));
    }, ms);
  });
  try {
    return await Promise.race([fn(ac.signal), timeout]);
  } catch (err) {
    if (ac.signal.aborted && !(err instanceof ProviderError)) {
      throw new ProviderError(provider, `timed out after ${ms}ms`, 'timeout');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
