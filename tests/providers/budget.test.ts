import { describe, expect, it } from 'vitest';
import { MemoryCache } from '@/lib/cache/memory';
import { AlphaVantageBudget } from '@/lib/cache/budget';

describe('AlphaVantageBudget', () => {
  it('refuses once remaining <= reserve (25/day, reserve 2 => 23 calls)', async () => {
    let t = Date.UTC(2026, 10, 6, 12, 0, 0);
    const b = new AlphaVantageBudget(new MemoryCache(), { dailyLimit: 25, reserve: 2, perMinute: 1000, now: () => t });
    let ok = 0;
    for (let i = 0; i < 30; i++) {
      const d = await b.tryConsume();
      if (d.ok) ok++;
      else expect(d.reason).toBe('daily_reserve');
      t += 1000;
    }
    expect(ok).toBe(23);
    const s = await b.status();
    expect(s).toMatchObject({ used: 23, limit: 25, remaining: 2 });
    expect(await b.canSpend()).toBe(false);
  });

  it('resets at UTC midnight', async () => {
    let t = Date.UTC(2026, 10, 6, 23, 59, 0);
    const b = new AlphaVantageBudget(new MemoryCache(), { dailyLimit: 5, reserve: 2, perMinute: 1000, now: () => t });
    expect((await b.tryConsume()).ok).toBe(true);
    expect((await b.tryConsume()).ok).toBe(true);
    expect((await b.tryConsume()).ok).toBe(true);
    expect((await b.tryConsume()).ok).toBe(false);
    expect((await b.status()).resetsAt).toBe('2026-11-07T00:00:00.000Z');
    t = Date.UTC(2026, 10, 7, 0, 0, 1);
    expect(await b.status()).toMatchObject({ used: 0, remaining: 5 });
    expect((await b.tryConsume()).ok).toBe(true);
  });

  it('enforces the per-minute limit without spending the daily budget', async () => {
    let t = Date.UTC(2026, 10, 6, 12, 0, 0);
    const b = new AlphaVantageBudget(new MemoryCache(), { dailyLimit: 25, reserve: 2, perMinute: 2, now: () => t });
    expect((await b.tryConsume()).ok).toBe(true);
    expect((await b.tryConsume()).ok).toBe(true);
    const d = await b.tryConsume();
    expect(d).toMatchObject({ ok: false, reason: 'per_minute' });
    expect((await b.status()).used).toBe(2);
    t += 61_000;
    expect((await b.tryConsume()).ok).toBe(true);
  });

  it('markExhausted stops spending until the next UTC day', async () => {
    const t = Date.UTC(2026, 10, 6, 12);
    const b = new AlphaVantageBudget(new MemoryCache(), { dailyLimit: 25, now: () => t });
    await b.markExhausted();
    expect((await b.status()).remaining).toBe(0);
    expect((await b.tryConsume()).ok).toBe(false);
  });

  it('reads ALPHA_VANTAGE_DAILY_BUDGET from env (default 25)', () => {
    expect(AlphaVantageBudget.fromEnv(new MemoryCache(), {} as NodeJS.ProcessEnv).dailyLimit).toBe(25);
    expect(AlphaVantageBudget.fromEnv(new MemoryCache(), { ALPHA_VANTAGE_DAILY_BUDGET: '100' } as unknown as NodeJS.ProcessEnv).dailyLimit).toBe(100);
  });
});
