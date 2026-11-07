import { describe, expect, it, vi } from 'vitest';
import { isRetryable, withRetry, withTimeout } from '@/lib/cache/resilience';
import { ProviderError } from '@/lib/providers/types';
import { HttpProviderError } from '@/lib/providers/http';

describe('withRetry', () => {
  it('retries at most 2 times with exponential backoff + jitter', async () => {
    const delays: number[] = [];
    const fn = vi.fn(async () => {
      throw new ProviderError('x', 'down', 'unavailable');
    });
    await expect(withRetry(fn, { baseMs: 100, sleep: async (ms) => void delays.push(ms), random: () => 1 })).rejects.toThrow('down');
    expect(fn).toHaveBeenCalledTimes(3);
    expect(delays).toEqual([100, 200]);
  });

  it('caps retries at 2 even if more are requested', async () => {
    const fn = vi.fn(async () => {
      throw new Error('net');
    });
    await expect(withRetry(fn, { retries: 10, sleep: async () => undefined })).rejects.toThrow();
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('never retries 4xx except 429', async () => {
    for (const status of [400, 401, 403, 404]) {
      const fn = vi.fn(async () => {
        throw new HttpProviderError('x', status);
      });
      await expect(withRetry(fn, { sleep: async () => undefined })).rejects.toThrow();
      expect(fn).toHaveBeenCalledTimes(1);
    }
    let n = 0;
    const r = await withRetry(
      async () => {
        if (n++ < 2) throw new HttpProviderError('x', 429);
        return 'ok';
      },
      { sleep: async () => undefined },
    );
    expect(r).toBe('ok');
    expect(isRetryable(new HttpProviderError('x', 503))).toBe(true);
    expect(isRetryable(new ProviderError('x', 'm', 'not_found'))).toBe(false);
    expect(isRetryable(new ProviderError('x', 'm', 'budget_exhausted'))).toBe(false);
  });
});

describe('withTimeout', () => {
  it('aborts the signal and rejects with ProviderError(timeout)', async () => {
    vi.useFakeTimers();
    let aborted = false;
    const p = withTimeout(
      'x',
      (signal) =>
        new Promise<string>((resolve) => {
          signal.addEventListener('abort', () => (aborted = true));
          setTimeout(() => resolve('late'), 10_000);
        }),
      5000,
    );
    const assertion = expect(p).rejects.toMatchObject({ kind: 'timeout' });
    await vi.advanceTimersByTimeAsync(5001);
    await assertion;
    expect(aborted).toBe(true);
    vi.useRealTimers();
  });

  it('passes through fast results', async () => {
    await expect(withTimeout('x', async () => 42, 5000)).resolves.toBe(42);
  });
});
