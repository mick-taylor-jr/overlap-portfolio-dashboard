import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProviderChain } from '@/lib/providers/chain';
import { MemoryCache } from '@/lib/cache/memory';
import { AlphaVantageBudget } from '@/lib/cache/budget';
import { cryptoResponseSchema, fundProfileResponseSchema, healthResponseSchema, quoteResponseSchema, searchResponseSchema } from '@/lib/api-contracts';
import { ProviderError } from '@/lib/providers/types';
import { fakeSeed, profile, quote } from './helpers';

vi.mock('next/server', () => ({
  connection: async () => undefined,
  after: (task: () => Promise<void>) => void task().catch(() => undefined),
}));

let chain: ProviderChain;
vi.mock('@/lib/providers', () => ({ getChain: () => chain }));

const quoteRoute = await import('@/app/api/quote/route');
const profileRoute = await import('@/app/api/fund-profile/route');
const cryptoRoute = await import('@/app/api/crypto/route');
const searchRoute = await import('@/app/api/search/route');
const healthRoute = await import('@/app/api/health/route');
const cronRoute = await import('@/app/api/cron/warm/route');

const req = (path: string, headers: Record<string, string> = {}) => new Request(`http://localhost${path}`, { headers });

beforeEach(() => {
  const cache = new MemoryCache();
  chain = new ProviderChain({
    cache,
    budget: new AlphaVantageBudget(cache),
    seed: fakeSeed({ profiles: ['SPY'] }),
    yahoo: {
      name: 'yahoo',
      getQuotes: async (s) => s.filter((x) => x !== 'BAD').map((x) => quote(x, 'yahoo')),
      getFundProfile: async (s) => (s === 'SPY' ? profile('SPY', 'yahoo') : Promise.reject(new ProviderError('yahoo', 'not a fund', 'not_found'))),
      search: async () => [{ symbol: 'VOO', name: 'Vanguard S&P 500 ETF', assetClass: 'fund', source: 'yahoo' }],
    },
    env: () => ({}) as NodeJS.ProcessEnv,
  });
});

describe('route param validation -> 400', () => {
  const cases: Array<[string, { GET: (r: Request) => Promise<Response> }, string]> = [
    ['quote missing', quoteRoute, '/api/quote'],
    ['quote empty', quoteRoute, '/api/quote?symbols='],
    ['quote bad chars', quoteRoute, '/api/quote?symbols=AAPL,<script>'],
    ['quote too many', quoteRoute, `/api/quote?symbols=${Array.from({ length: 51 }, (_, i) => `S${i}`).join(',')}`],
    ['quote too long symbol', quoteRoute, '/api/quote?symbols=ABCDEFGHIJKLMNOP'],
    ['fund-profile missing', profileRoute, '/api/fund-profile'],
    ['fund-profile bad', profileRoute, '/api/fund-profile?symbols=SP%20Y'],
    ['crypto missing', cryptoRoute, '/api/crypto'],
    ['crypto bad', cryptoRoute, '/api/crypto?ids=bit_coin'],
    ['search missing', searchRoute, '/api/search'],
    ['search blank', searchRoute, '/api/search?q=%20%20'],
    ['search too long', searchRoute, `/api/search?q=${'a'.repeat(65)}`],
  ];
  for (const [label, route, path] of cases) {
    it(label, async () => {
      const res = await route.GET(req(path));
      expect(res.status).toBe(400);
      expect(res.headers.get('cache-control')).toBe('no-store');
      const body = (await res.json()) as { error: string };
      expect(body.error).toMatch(/Invalid query parameter/);
    });
  }
});

describe('route happy paths match lib/api-contracts', () => {
  it('/api/quote: partial failure goes in errors, not a 500', async () => {
    const res = await quoteRoute.GET(req('/api/quote?symbols=AAPL,BAD'));
    expect(res.status).toBe(200);
    const body = quoteResponseSchema.parse(await res.json());
    expect(body.quotes.AAPL?.source).toBe('yahoo');
    expect(body.quotes.BAD).toBeNull();
    expect(body.errors.BAD).toBeTruthy();
    expect(res.headers.get('cache-control')).toMatch(/s-maxage=10/);
  });
  it('/api/fund-profile', async () => {
    const res = await profileRoute.GET(req('/api/fund-profile?symbols=SPY,AAPL'));
    const body = fundProfileResponseSchema.parse(await res.json());
    expect(body.profiles.SPY?.source).toBe('yahoo');
    expect(body.profiles.AAPL).toBeNull();
    expect(body.errors.AAPL).toMatch(/not a fund/);
  });
  it('/api/fund-profile all ok -> long CDN cache', async () => {
    const res = await profileRoute.GET(req('/api/fund-profile?symbols=SPY'));
    expect(res.headers.get('cache-control')).toMatch(/s-maxage=86400/);
  });
  it('/api/crypto without a CoinGecko key: errors per id, 200', async () => {
    const res = await cryptoRoute.GET(req('/api/crypto?ids=BTC'));
    expect(res.status).toBe(200);
    const body = cryptoResponseSchema.parse(await res.json());
    expect(body.prices.btc).toBeNull();
    expect(body.errors.btc).toMatch(/coingecko not configured/);
  });
  it('/api/search', async () => {
    const res = await searchRoute.GET(req('/api/search?q=vang'));
    const body = searchResponseSchema.parse(await res.json());
    expect(body.results[0].symbol).toBe('VOO');
    expect(res.headers.get('cache-control')).toMatch(/s-maxage=3600/);
  });
  it('/api/health', async () => {
    const res = await healthRoute.GET();
    const body = healthResponseSchema.parse(await res.json());
    expect(body.mode).toBe('live'); // yahoo needs no key
    expect(res.headers.get('cache-control')).toBe('no-store');
  });
});

describe('/api/cron/warm auth', () => {
  it('401 without/with wrong bearer, 200 with CRON_SECRET', async () => {
    process.env.CRON_SECRET = 'test-secret-123456';
    expect((await cronRoute.GET(req('/api/cron/warm'))).status).toBe(401);
    expect((await cronRoute.GET(req('/api/cron/warm', { authorization: 'Bearer nope' }))).status).toBe(401);
    const ok = await cronRoute.GET(req('/api/cron/warm', { authorization: 'Bearer test-secret-123456' }));
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { stoppedReason: string }).stoppedReason).toMatch(/not configured/);
    delete process.env.CRON_SECRET;
    expect((await cronRoute.GET(req('/api/cron/warm', { authorization: 'Bearer undefined' }))).status).toBe(401);
  });
});

describe('search when every live source fails', () => {
  it('uses the short CDN cache', async () => {
    const cache = new MemoryCache();
    chain = new ProviderChain({ cache, budget: new AlphaVantageBudget(cache), seed: fakeSeed(), env: () => ({}) as NodeJS.ProcessEnv });
    const res = await searchRoute.GET(req('/api/search?q=vang'));
    expect(res.headers.get('cache-control')).toMatch(/s-maxage=10/);
  });
  it('missing param message names the expected format', async () => {
    const body = (await (await quoteRoute.GET(req('/api/quote'))).json()) as { error: string };
    expect(body.error).toMatch(/symbols=AAPL,SPY/);
  });
});
