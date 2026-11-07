import { beforeEach, describe, expect, it, vi } from 'vitest';
import { keyedByRequest, mergeProfileHoldings, ProviderChain, type SecuritiesProvider } from '@/lib/providers/chain';
import { MemoryCache } from '@/lib/cache/memory';
import { AlphaVantageBudget } from '@/lib/cache/budget';
import { ProviderError } from '@/lib/providers/types';
import { resetBreakersForTests } from '@/lib/providers/guard';
import { resolveUpstashEnv, UpstashCache } from '@/lib/cache/upstash';
import { fundProfileSchema } from '@/lib/api-contracts';
import type { FundProfile } from '@/lib/types';
import type { SeedSource } from '@/lib/providers/seed';
import { profile, quote } from './helpers';

beforeEach(() => resetBreakersForTests());

const holdings = (n: number, w: number) => Array.from({ length: n }, (_, i) => ({ symbol: `H${i}`, name: `H${i}`, weight: w }));
const live = (cov: number, extra: Partial<FundProfile> = {}) =>
  profile('QQQ', 'yahoo', { holdings: holdings(10, cov / 10), holdingsCoverage: cov, expenseRatio: 0.002, name: 'Invesco QQQ Trust', sectorWeights: { 'Information Technology': 0.5 }, asOf: '2026-11-07T15:00:00.000Z', ...extra });
const seedP = (cov: number) =>
  profile('QQQ', 'seed', { holdings: holdings(25, cov / 25), holdingsCoverage: cov, totalHoldingsCount: 101, expenseRatio: 0.0018, name: 'Seed name', sectorWeights: { Financials: 1 }, asOf: '2026-10-23', stale: true });

function seedWith(profiles: Record<string, FundProfile>): SeedSource {
  return { capturedAt: '2026-10-23', quote: () => null, profile: (s) => profiles[s] ?? null, crypto: () => null, fundSymbols: () => Object.keys(profiles) };
}

function chainWith(yahoo: Partial<SecuritiesProvider>, seed: SeedSource) {
  const cache = new MemoryCache();
  const y: SecuritiesProvider = {
    name: 'yahoo',
    getQuotes: vi.fn(async (syms: string[]) => syms.map((s) => quote(s, 'yahoo'))),
    getFundProfile: vi.fn(async (s: string) => profile(s, 'yahoo')),
    search: vi.fn(async () => []),
    ...yahoo,
  };
  return { y, chain: new ProviderChain({ cache, budget: new AlphaVantageBudget(cache), seed, yahoo: y, env: () => ({}) as NodeJS.ProcessEnv }) };
}

describe('ticker normalization before provider calls', () => {
  it('keyedByRequest keys by sent symbol and normalized form', () => {
    const { norms, expand } = keyedByRequest(['SPY', 'brk.b', 'BRK-B']);
    expect(norms).toEqual(['SPY', 'BRK-B']);
    const r = expand({ values: { SPY: 1, 'BRK-B': 2 }, errors: {} });
    expect(r.values).toEqual({ SPY: 1, 'BRK.B': 2, 'BRK-B': 2 });
  });

  it('quotes: BRK.B is sent to yahoo as BRK-B and returned under both keys', async () => {
    const yq = vi.fn(async (syms: string[]) => syms.filter((s) => !s.includes('.')).map((s) => quote(s, 'yahoo')));
    const { chain } = chainWith({ getQuotes: yq }, seedWith({}));
    const r = await chain.getQuotes(['SPY', 'AAPL', 'BRK.B']);
    expect(yq).toHaveBeenCalledWith(['SPY', 'AAPL', 'BRK-B']);
    expect(r.values['BRK.B']).toMatchObject({ symbol: 'BRK-B', source: 'yahoo' });
    expect(r.values['BRK-B']).toMatchObject({ symbol: 'BRK-B' });
    expect(r.errors).toEqual({});
  });

  it('fund profiles: normalized before the provider call, keyed by sent symbol', async () => {
    const gp = vi.fn(async (s: string) => (s === 'BRK-B' ? profile(s, 'yahoo') : Promise.reject(new ProviderError('yahoo', 'not found', 'not_found'))));
    const { chain } = chainWith({ getFundProfile: gp }, seedWith({}));
    const r = await chain.getFundProfiles(['brk.b']);
    expect(gp).toHaveBeenCalledWith('BRK-B');
    expect(r.values['BRK.B']?.symbol).toBe('BRK-B');
    expect(r.values['BRK-B']?.symbol).toBe('BRK-B');
  });
});

describe('fund-profile choice by holdings coverage', () => {
  it('mergeProfileHoldings: seed better -> merged', () => {
    const m = mergeProfileHoldings(live(0.465), seedP(0.716));
    expect(m).toMatchObject({
      source: 'yahoo+seed',
      asOf: '2026-11-07T15:00:00.000Z',
      holdingsCoverage: 0.716,
      totalHoldingsCount: 101,
      expenseRatio: 0.002,
      name: 'Invesco QQQ Trust',
      sectorWeights: { 'Information Technology': 0.5 },
      holdingsSource: { source: 'seed', asOf: '2026-10-23' },
      stale: false,
    });
    expect(m.holdings).toHaveLength(25);
    expect(fundProfileSchema.safeParse(m).success).toBe(true);
  });

  it('mergeProfileHoldings: within the margin, equal, or live better -> live', () => {
    expect(mergeProfileHoldings(live(0.7), seedP(0.74)).source).toBe('yahoo');
    expect(mergeProfileHoldings(live(0.7), seedP(0.7)).source).toBe('yahoo');
    expect(mergeProfileHoldings(live(0.9), seedP(0.716)).source).toBe('yahoo');
  });

  it('chain: seed better -> merged (live call still made)', async () => {
    const { chain, y } = chainWith({ getFundProfile: vi.fn(async () => live(0.465)) }, seedWith({ QQQ: seedP(0.716) }));
    const r = await chain.getFundProfiles(['QQQ']);
    expect(y.getFundProfile).toHaveBeenCalledWith('QQQ');
    expect(r.values.QQQ).toMatchObject({ source: 'yahoo+seed', holdingsCoverage: 0.716, expenseRatio: 0.002 });
    // served from cache next time, still merged
    const again = await chain.getFundProfiles(['QQQ']);
    expect(again.values.QQQ?.source).toBe('yahoo+seed');
    expect(y.getFundProfile).toHaveBeenCalledTimes(1);
  });

  it('chain: live better or equal -> live', async () => {
    const { chain } = chainWith({ getFundProfile: vi.fn(async () => live(0.716)) }, seedWith({ QQQ: seedP(0.716) }));
    const r = await chain.getFundProfiles(['QQQ']);
    expect(r.values.QQQ?.source).toBe('yahoo');
    expect(r.values.QQQ?.holdingsSource).toBeUndefined();
  });

  it('chain: no seed -> live', async () => {
    const { chain } = chainWith({ getFundProfile: vi.fn(async () => live(0.465)) }, seedWith({}));
    expect((await chain.getFundProfiles(['QQQ'])).values.QQQ?.source).toBe('yahoo');
  });

  it('chain: live fails -> seed', async () => {
    const { chain } = chainWith({ getFundProfile: vi.fn(() => Promise.reject(new ProviderError('yahoo', 'down', 'unavailable'))) }, seedWith({ QQQ: seedP(0.716) }));
    const r = await chain.getFundProfiles(['QQQ']);
    expect(r.values.QQQ).toMatchObject({ source: 'seed', stale: true, holdingsCoverage: 0.716 });
  });
});

describe('Upstash env detection', () => {
  const env = (o: Record<string, string>) => o as unknown as NodeJS.ProcessEnv;

  it('UPSTASH_REDIS_* first, then KV_*', () => {
    expect(resolveUpstashEnv(env({ UPSTASH_REDIS_REST_URL: 'https://u', UPSTASH_REDIS_REST_TOKEN: 't', KV_REST_API_URL: 'https://k', KV_REST_API_TOKEN: 'k' }))?.prefix).toBe('UPSTASH_REDIS');
    expect(resolveUpstashEnv(env({ KV_REST_API_URL: 'https://k', KV_REST_API_TOKEN: 'k', STORAGE_REST_API_URL: 'https://s', STORAGE_REST_API_TOKEN: 's' }))).toEqual({ url: 'https://k', token: 'k', prefix: 'KV' });
  });

  it('custom Vercel Marketplace prefix (STORAGE_*), ignoring the read-only token', () => {
    const r = resolveUpstashEnv(
      env({
        STORAGE_URL: 'rediss://x',
        STORAGE_REDIS_URL: 'rediss://x',
        STORAGE_REST_API_READ_ONLY_TOKEN: 'ro',
        STORAGE_REST_API_URL: 'https://s',
        STORAGE_REST_API_TOKEN: 'rw',
      }),
    );
    expect(r).toEqual({ url: 'https://s', token: 'rw', prefix: 'STORAGE' });
  });

  it('requires a matching write token; nothing set -> null (memory)', () => {
    expect(resolveUpstashEnv(env({ STORAGE_REST_API_URL: 'https://s', STORAGE_REST_API_READ_ONLY_TOKEN: 'ro' }))).toBeNull();
    expect(resolveUpstashEnv(env({ UPSTASH_REDIS_REST_URL: 'https://u' }))).toBeNull();
    expect(resolveUpstashEnv(env({}))).toBeNull();
  });

  it('UpstashCache.fromEnv exposes only the prefix name; health reports it', async () => {
    const c = UpstashCache.fromEnv(env({ STORAGE_REST_API_URL: 'https://example.upstash.io', STORAGE_REST_API_TOKEN: 'secret-token' }));
    expect(c?.backend).toBe('upstash');
    expect(c?.envPrefix).toBe('STORAGE');
    if (!c) throw new Error('no cache');
    const mem = new MemoryCache();
    const chain = new ProviderChain({ cache: c, budget: new AlphaVantageBudget(mem), seed: seedWith({}), env: () => ({}) as NodeJS.ProcessEnv });
    const h = await chain.health();
    expect(h.cache).toBe('upstash');
    expect(h.cacheEnvPrefix).toBe('STORAGE');
    expect(JSON.stringify(h)).not.toContain('secret-token');
    expect(JSON.stringify(h)).not.toContain('example.upstash.io');
  });
});

import { sanitizeProfileWeights as _spw } from '@/lib/providers/chain';
import { describe as _d3, it as _it3, expect as _e3 } from 'vitest';
_d3('sanitizeProfileWeights', () => {
  _it3('cleans a cached profile with negative cash so look-through math can run', () => {
    const p = _spw({
      symbol: 'VOO', name: 'VOO', expenseRatio: 0.0003, holdings: [{ symbol: 'AAPL', name: 'Apple', weight: 0.07 }],
      sectorWeights: { 'Information Technology': 0.35 }, assetAllocation: { stock: 1.0012, cash: -0.0012 },
      holdingsCoverage: 0.07, source: 'yahoo', asOf: '2026-11-07T15:00:00Z', stale: false,
    });
    _e3(p.assetAllocation?.cash).toBe(0);
    _e3((p.assetAllocation?.stock ?? 0)).toBeLessThanOrEqual(1);
  });
});
