import { describe, expect, it } from 'vitest';
import { MemoryCache } from '@/lib/cache/memory';
import { freshness } from '@/lib/cache/types';
import { SingleFlight } from '@/lib/cache/singleflight';
import { isUsMarketOpen, quoteTtlSeconds } from '@/lib/cache/ttl';

describe('MemoryCache + freshness', () => {
  it('tracks fresh -> revalidate -> expired', async () => {
    const c = new MemoryCache();
    await c.set('k', { a: 1 }, { ttlSeconds: 10, swrSeconds: 20, keepSeconds: 100 }, 0);
    const e = await c.get<{ a: number }>('k');
    expect(e?.value.a).toBe(1);
    if (!e) throw new Error('missing');
    expect(freshness(e, 5_000)).toBe('fresh');
    expect(freshness(e, 15_000)).toBe('revalidate');
    expect(freshness(e, 31_000)).toBe('expired');
  });
});

describe('SingleFlight', () => {
  it('dedups concurrent calls by key', async () => {
    const sf = new SingleFlight();
    let calls = 0;
    const fn = async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 5));
      return calls;
    };
    const [a, b] = await Promise.all([sf.do('k', fn), sf.do('k', fn)]);
    expect(calls).toBe(1);
    expect(a).toBe(b);
    await sf.do('k', fn);
    expect(calls).toBe(2);
  });
});

describe('market-hours TTL', () => {
  it('5 min during the NYSE session, 60 min otherwise (DST-aware)', () => {
    // Fri 2026-11-06 10:00 EST = 15:00 UTC
    expect(isUsMarketOpen(new Date('2026-11-06T15:00:00Z'))).toBe(true);
    expect(quoteTtlSeconds(new Date('2026-11-06T15:00:00Z'))).toBe(300);
    // 09:29 EST
    expect(isUsMarketOpen(new Date('2026-11-06T14:29:00Z'))).toBe(false);
    // 16:00 EST closes
    expect(isUsMarketOpen(new Date('2026-11-06T21:00:00Z'))).toBe(false);
    // Saturday
    expect(quoteTtlSeconds(new Date('2026-11-07T15:00:00Z'))).toBe(3600);
    // Summer (EDT): 09:30 EDT = 13:30 UTC
    expect(isUsMarketOpen(new Date('2026-07-01T13:30:00Z'))).toBe(true);
  });
});
