import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CoinGeckoProvider, parseSimplePrice, pickCoinId, resolveStatic } from '@/lib/providers/coingecko';
import { resetBreakersForTests } from '@/lib/providers/guard';
import { fixture, jsonResponse, noSleep } from './helpers';

beforeEach(() => resetBreakersForTests());

describe('CoinGecko id resolution', () => {
  it('static table resolves tickers and passes known ids through', () => {
    expect(resolveStatic('BTC')).toBe('bitcoin');
    expect(resolveStatic('eth')).toBe('ethereum');
    expect(resolveStatic('bitcoin')).toBe('bitcoin');
    expect(resolveStatic('render-token')).toBeNull();
  });
  it('/search: exact id wins, else lowest market-cap rank among symbol matches (null ranks last)', () => {
    const body = fixture('cg-search-sol.json');
    expect(pickCoinId('wrapped-solana', body)).toBe('wrapped-solana');
    expect(pickCoinId('sol', body)).toBe('solana');
    expect(pickCoinId('nope', body)).toBeNull();
  });
  it('provider uses static table first, then /search with the demo header', async () => {
    const calls: Array<{ url: string; headers: Record<string, string> }> = [];
    const fetchImpl = vi.fn(async (u: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(u), headers: (init?.headers ?? {}) as Record<string, string> });
      return jsonResponse({ coins: [{ id: 'render-token', name: 'Render', symbol: 'RNDR', market_cap_rank: 50 }] });
    }) as unknown as typeof fetch;
    const cg = new CoinGeckoProvider({ apiKey: 'CGKEY', fetchImpl, guard: noSleep });
    expect(await cg.resolveId('BTC')).toBe('bitcoin');
    expect(calls).toHaveLength(0);
    expect(await cg.resolveId('rndr')).toBe('render-token');
    expect(calls[0].url).toBe('https://api.coingecko.com/api/v3/search?query=rndr');
    expect(calls[0].headers['x-cg-demo-api-key']).toBe('CGKEY');
  });
});

describe('/simple/price', () => {
  it('batches ids comma-separated and parses usd + last_updated_at', async () => {
    let url = '';
    const fetchImpl = vi.fn(async (u: string | URL | Request) => {
      url = String(u);
      return jsonResponse(fixture('cg-simple-price.json'));
    }) as unknown as typeof fetch;
    const cg = new CoinGeckoProvider({ apiKey: 'k', fetchImpl, guard: noSleep, now: () => new Date('2026-11-06T00:00:00Z') });
    const prices = await cg.getPrices(['bitcoin', 'ethereum', 'missing-coin']);
    expect(new URL(url).searchParams.get('ids')).toBe('bitcoin,ethereum,missing-coin');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(prices).toHaveLength(2);
    expect(prices[0]).toMatchObject({ id: 'bitcoin', usd: 76975, source: 'coingecko', stale: false, asOf: new Date(1779092258 * 1000).toISOString() });
    expect(prices[1].asOf).toBe('2026-11-06T00:00:00.000Z');
  });
  it('rejects malformed bodies', () => {
    expect(() => parseSimplePrice([], ['bitcoin'], 'x')).toThrow(/unexpected shape/);
  });
  it('429 is retried, then surfaces as rate_limited', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 429 })) as unknown as typeof fetch;
    const cg = new CoinGeckoProvider({ apiKey: 'k', fetchImpl, guard: noSleep });
    await expect(cg.getPrices(['bitcoin'])).rejects.toMatchObject({ kind: 'rate_limited' });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
});
