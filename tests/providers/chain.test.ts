import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProviderChain, type CoinProvider, type SecuritiesProvider } from '@/lib/providers/chain';
import { MemoryCache } from '@/lib/cache/memory';
import { AlphaVantageBudget } from '@/lib/cache/budget';
import { ProviderError } from '@/lib/providers/types';
import { resetBreakersForTests } from '@/lib/providers/guard';
import { fakeSeed, profile, quote } from './helpers';

const down = (name: string) => () => Promise.reject(new ProviderError(name, 'down', 'unavailable'));

function securities(name: string, over: Partial<SecuritiesProvider> = {}): SecuritiesProvider {
  return {
    name,
    getQuotes: vi.fn(async (syms: string[]) => syms.map((s) => quote(s, name))),
    getFundProfile: vi.fn(async (s: string) => profile(s, name)),
    search: vi.fn(async (q: string) => [{ symbol: q.toUpperCase(), name: q, assetClass: 'fund' as const, source: name }]),
    ...over,
  };
}

function coins(over: Partial<CoinProvider> = {}): CoinProvider {
  return {
    name: 'coingecko',
    getPrices: vi.fn(async (ids: string[]) => ids.map((id) => ({ id, usd: 50, source: 'coingecko', asOf: 'x', stale: false }))),
    resolveId: vi.fn(async (t: string) => (t === 'rndr' ? 'render-token' : null)),
    search: vi.fn(async () => [{ symbol: 'bitcoin', name: 'Bitcoin (BTC)', assetClass: 'crypto' as const, source: 'coingecko' }]),
    ...over,
  };
}

const ENV = { ALPHA_VANTAGE_API_KEY: 'a', COINGECKO_API_KEY: 'c' } as unknown as NodeJS.ProcessEnv;

function setup(opts: { yahoo?: SecuritiesProvider | null; av?: SecuritiesProvider | null; cg?: CoinProvider | null; env?: NodeJS.ProcessEnv; seed?: Parameters<typeof fakeSeed>[0]; dailyLimit?: number } = {}) {
  let t = Date.UTC(2026, 10, 6, 15, 0, 0); // market open -> quote ttl 300s
  const cache = new MemoryCache();
  const budget = new AlphaVantageBudget(cache, { dailyLimit: opts.dailyLimit ?? 25, perMinute: 100, now: () => t });
  const deferred: Array<() => Promise<void>> = [];
  const deps = {
    cache,
    budget,
    seed: fakeSeed(opts.seed),
    yahoo: opts.yahoo === null ? undefined : (opts.yahoo ?? securities('yahoo')),
    alphavantage: opts.av === null ? undefined : (opts.av ?? securities('alphavantage')),
    coingecko: opts.cg === null ? undefined : (opts.cg ?? coins()),
    env: () => opts.env ?? ENV,
    now: () => t,
  };
  const chain = new ProviderChain(deps);
  return {
    chain,
    deps,
    cache,
    budget,
    defer: (task: () => Promise<void>) => void deferred.push(task),
    runDeferred: async () => {
      for (const d of deferred.splice(0)) await d();
    },
    advance: (ms: number) => (t += ms),
  };
}

beforeEach(() => resetBreakersForTests());

describe('quotes: yahoo -> alphavantage -> last cached (stale) -> seed', () => {
  it('yahoo serves first', async () => {
    const s = setup();
    const r = await s.chain.getQuotes(['aapl']);
    expect(r.values.AAPL).toMatchObject({ source: 'yahoo', stale: false });
    expect(s.deps.alphavantage?.getQuotes).not.toHaveBeenCalled();
  });

  it('yahoo down -> alphavantage; only missing symbols fall through', async () => {
    const y = securities('yahoo', { getQuotes: vi.fn(async () => [quote('AAPL', 'yahoo')]) });
    const s = setup({ yahoo: y });
    const r = await s.chain.getQuotes(['AAPL', 'SPY']);
    expect(r.values.AAPL?.source).toBe('yahoo');
    expect(r.values.SPY?.source).toBe('alphavantage');
    expect(s.deps.alphavantage?.getQuotes).toHaveBeenCalledWith(['SPY']);
  });

  it('both down -> last cached value with stale:true', async () => {
    const s = setup();
    await s.chain.getQuotes(['AAPL']);
    s.advance(3 * 3600 * 1000); // past ttl + swr, still kept
    (s.deps.yahoo as SecuritiesProvider).getQuotes = down('yahoo');
    (s.deps.alphavantage as SecuritiesProvider).getQuotes = down('alphavantage');
    const r = await s.chain.getQuotes(['AAPL']);
    expect(r.values.AAPL).toMatchObject({ source: 'yahoo', stale: true });
    expect(r.errors).toEqual({});
  });

  it('nothing cached -> seed (stale:true); nothing anywhere -> null + error, batch survives', async () => {
    const s = setup({ yahoo: securities('yahoo', { getQuotes: down('yahoo') }), av: securities('alphavantage', { getQuotes: down('alphavantage') }), seed: { quotes: ['SPY'] } });
    const r = await s.chain.getQuotes(['SPY', 'ZZZZ']);
    expect(r.values.SPY).toMatchObject({ source: 'seed', stale: true, asOf: '2026-11-01' });
    expect(r.values.ZZZZ).toBeNull();
    expect(r.errors.ZZZZ).toMatch(/down/);
  });

  it('OVERLAP_DISABLE_PROVIDERS skips providers', async () => {
    const s = setup({ env: { ...ENV, OVERLAP_DISABLE_PROVIDERS: 'yahoo' } as NodeJS.ProcessEnv });
    const r = await s.chain.getQuotes(['AAPL']);
    expect(s.deps.yahoo?.getQuotes).not.toHaveBeenCalled();
    expect(r.values.AAPL?.source).toBe('alphavantage');
    const s2 = setup({ env: { ...ENV, OVERLAP_DISABLE_PROVIDERS: 'yahoo,alphavantage' } as NodeJS.ProcessEnv, seed: { quotes: ['AAPL'] } });
    expect((await s2.chain.getQuotes(['AAPL'])).values.AAPL?.source).toBe('seed');
  });

  it('missing AV key: provider absent and skipped', async () => {
    const s = setup({ yahoo: securities('yahoo', { getQuotes: down('yahoo') }), av: null, seed: { quotes: ['AAPL'] } });
    expect((await s.chain.getQuotes(['AAPL'])).values.AAPL?.source).toBe('seed');
  });

  it('stale-while-revalidate: serves cached immediately, refreshes in background, flags stale if refresh fails', async () => {
    const s = setup();
    await s.chain.getQuotes(['AAPL']);
    s.advance(301_000); // past 5-min ttl, inside swr window
    (s.deps.yahoo as SecuritiesProvider).getQuotes = vi.fn(down('yahoo'));
    (s.deps.alphavantage as SecuritiesProvider).getQuotes = vi.fn(down('alphavantage'));
    const r1 = await s.chain.getQuotes(['AAPL'], { defer: s.defer });
    expect(r1.values.AAPL).toMatchObject({ source: 'yahoo', stale: false });
    expect(s.deps.yahoo?.getQuotes).not.toHaveBeenCalled(); // not on the request path
    await s.runDeferred();
    expect(s.deps.yahoo?.getQuotes).toHaveBeenCalledTimes(1);
    const r2 = await s.chain.getQuotes(['AAPL'], { defer: s.defer });
    expect(r2.values.AAPL?.stale).toBe(true);
    // refresh succeeds -> fresh again
    (s.deps.yahoo as SecuritiesProvider).getQuotes = vi.fn(async (syms: string[]) => syms.map((x) => quote(x, 'yahoo', 123)));
    await s.runDeferred();
    const r3 = await s.chain.getQuotes(['AAPL']);
    expect(r3.values.AAPL).toMatchObject({ price: 123, stale: false });
  });

  it('dedups concurrent requests for the same symbol', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => (release = r));
    const getQuotes = vi.fn(async (syms: string[]) => {
      await gate;
      return syms.map((x) => quote(x, 'yahoo'));
    });
    const s = setup({ yahoo: securities('yahoo', { getQuotes }) });
    const a = s.chain.getQuotes(['AAPL']);
    const b = s.chain.getQuotes(['AAPL', 'MSFT']);
    await new Promise((r) => setTimeout(r, 0));
    release();
    const [ra, rb] = await Promise.all([a, b]);
    expect(ra.values.AAPL?.source).toBe('yahoo');
    expect(rb.values.MSFT?.source).toBe('yahoo');
    const all = getQuotes.mock.calls.flatMap((c) => c[0]);
    expect(all.filter((x) => x === 'AAPL')).toHaveLength(1);
  });
});

describe('fund profiles: alphavantage -> yahoo -> last cached -> seed', () => {
  it('AV first (name enriched from seed), cached for 7 days', async () => {
    const av = securities('alphavantage', { getFundProfile: vi.fn(async (sym: string) => ({ ...profile(sym, 'alphavantage'), name: sym })) });
    const s = setup({ av, seed: { profiles: ['QQQ'] } });
    const r = await s.chain.getFundProfiles(['QQQ']);
    expect(r.values.QQQ).toMatchObject({ source: 'alphavantage', name: 'QQQ Fund', stale: false });
    s.advance(6 * 24 * 3600 * 1000);
    await s.chain.getFundProfiles(['QQQ']);
    expect(av.getFundProfile).toHaveBeenCalledTimes(1);
  });

  it('AV down -> yahoo -> seed, with stale flags', async () => {
    const s = setup({ av: securities('alphavantage', { getFundProfile: down('alphavantage') }) });
    expect((await s.chain.getFundProfiles(['SPY'])).values.SPY).toMatchObject({ source: 'yahoo', stale: false });
    const s2 = setup({ av: securities('alphavantage', { getFundProfile: down('alphavantage') }), yahoo: securities('yahoo', { getFundProfile: down('yahoo') }), seed: { profiles: ['SPY'] } });
    const r = await s2.chain.getFundProfiles(['SPY', 'NOPE']);
    expect(r.values.SPY).toMatchObject({ source: 'seed', stale: true });
    expect(r.values.NOPE).toBeNull();
    expect(r.errors.NOPE).toMatch(/alphavantage.*down.*yahoo.*down/);
  });

  it('AV skipped without a key', async () => {
    const s = setup({ av: null });
    expect((await s.chain.getFundProfiles(['SPY'])).values.SPY?.source).toBe('yahoo');
  });
});

describe('crypto: coingecko -> last cached -> seed', () => {
  it('resolves tickers, echoes the requested key', async () => {
    const s = setup();
    const r = await s.chain.getCryptoPrices(['BTC', 'bitcoin', 'rndr']);
    expect(r.values.btc).toMatchObject({ id: 'bitcoin', source: 'coingecko' });
    expect(r.values.bitcoin?.id).toBe('bitcoin');
    expect(r.values.rndr?.id).toBe('render-token');
    expect(s.deps.coingecko?.getPrices).toHaveBeenCalledWith(['bitcoin', 'render-token']);
  });

  it('coingecko down -> last cached stale -> seed -> error', async () => {
    const s = setup({ seed: { crypto: ['ethereum'] } });
    await s.chain.getCryptoPrices(['bitcoin']);
    s.advance(10 * 60 * 1000);
    (s.deps.coingecko as CoinProvider).getPrices = down('coingecko');
    const r = await s.chain.getCryptoPrices(['bitcoin', 'eth', 'dogecoin']);
    expect(r.values.bitcoin).toMatchObject({ source: 'coingecko', stale: true });
    expect(r.values.eth).toMatchObject({ source: 'seed', stale: true });
    expect(r.values.dogecoin).toBeNull();
    expect(r.errors.dogecoin).toMatch(/down/);
  });

  it('no coingecko key -> seed only', async () => {
    const s = setup({ cg: null, seed: { crypto: ['bitcoin'] } });
    const r = await s.chain.getCryptoPrices(['btc']);
    expect(r.values.btc?.source).toBe('seed');
  });
});

describe('search: yahoo -> alphavantage, plus coingecko for crypto', () => {
  it('merges securities and crypto; falls back to AV when yahoo fails', async () => {
    const s = setup({ yahoo: securities('yahoo', { search: down('yahoo') }) });
    const r = await s.chain.search('voo');
    expect(r.map((x) => x.source)).toEqual(['alphavantage', 'coingecko']);
  });
  it('all down: static crypto table and seed symbols, not cached', async () => {
    const s = setup({ yahoo: securities('yahoo', { search: down('yahoo') }), av: null, cg: null, seed: { profiles: ['VOO', 'VTI'] } });
    const r = await s.chain.search('v');
    expect(r.map((x) => x.symbol)).toEqual(['VOO', 'VTI']);
    const btc = await s.chain.search('bt');
    expect(btc[0]).toMatchObject({ symbol: 'bitcoin', assetClass: 'crypto', source: 'static' });
  });
  it('caches for 24h', async () => {
    const s = setup();
    await s.chain.search('vang');
    await s.chain.search('VANG');
    expect(s.deps.yahoo?.search).toHaveBeenCalledTimes(1);
  });
});

describe('health', () => {
  it('seed-only when no provider is usable; reports budget, no secrets', async () => {
    const s = setup({ av: null, cg: null, env: { OVERLAP_DISABLE_PROVIDERS: 'yahoo' } as unknown as NodeJS.ProcessEnv });
    const h = await s.chain.health();
    expect(h.mode).toBe('seed-only');
    expect(h.providers.every((p) => !p.configured)).toBe(true);
    expect(h.providers.find((p) => p.name === 'yahoo')?.lastError).toMatch(/disabled/);
    expect(h.alphaVantageBudget).toMatchObject({ limit: 25, remaining: 25 });
    expect(h.cache).toBe('memory');
    expect(JSON.stringify(h)).not.toMatch(/"a"|"c"/);
  });
  it('live when keys are set', async () => {
    const h = await setup().chain.health();
    expect(h.mode).toBe('live');
    expect(h.providers.map((p) => p.configured)).toEqual([true, true, true]);
  });
});

describe('cron warm', () => {
  it('stops at the AV budget reserve and only uses alphavantage', async () => {
    const s = setup({ dailyLimit: 5, seed: { profiles: ['SPY', 'VOO', 'QQQ', 'VTI', 'IVV'] } });
    // like the real adapter: each call spends one budget unit
    (s.deps.alphavantage as SecuritiesProvider).getFundProfile = vi.fn(async (sym: string) => {
      const d = await s.budget.tryConsume();
      if (!d.ok) throw new ProviderError('alphavantage', 'reserve', 'budget_exhausted');
      return profile(sym, 'alphavantage');
    });
    const r = await s.chain.warmProfiles(10);
    expect(r.warmed).toHaveLength(3); // 5 - 3 = 2 = reserve
    expect(r.stoppedReason).toMatch(/budget/);
    expect(r.skipped).toHaveLength(2);
    expect(s.deps.yahoo?.getFundProfile).not.toHaveBeenCalled();
    expect(r.budget.remaining).toBe(2);
    // next run: the 3 freshly warmed are skipped, budget still at reserve
    const r2 = await s.chain.warmProfiles(10);
    expect(r2.warmed).toHaveLength(0);
  });
  it('respects max per run and reports when AV is not configured', async () => {
    const s = setup({ seed: { profiles: ['SPY', 'VOO', 'QQQ'] } });
    expect((await s.chain.warmProfiles(2)).warmed).toHaveLength(2);
    expect((await setup({ av: null, seed: { profiles: ['SPY'] } }).chain.warmProfiles(5)).stoppedReason).toMatch(/not configured/);
  });
});
