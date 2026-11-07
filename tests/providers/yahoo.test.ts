import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseYahooFundProfile, parseYahooQuotes, parseYahooSearch, YahooProvider, type YahooLike } from '@/lib/providers/yahoo';
import { fundProfileSchema, quoteSchema } from '@/lib/api-contracts';
import { breakerFor, resetBreakersForTests } from '@/lib/providers/guard';
import { fixture, noSleep } from './helpers';

const NOW = '2026-11-06T12:00:00.000Z';
beforeEach(() => resetBreakersForTests());

describe('Yahoo parsing', () => {
  it('quotes: accepts coerced and raw {raw} numbers, drops non-positive prices', () => {
    const q = parseYahooQuotes(fixture('yahoo-quote.json'), NOW);
    expect(q.map((x) => x.symbol)).toEqual(['AAPL', 'SPY']);
    expect(q[0]).toMatchObject({ price: 225.5, name: 'Apple Inc.', asOf: '2026-11-06T21:00:00.000Z', source: 'yahoo', stale: false });
    expect(q[1].price).toBe(600.12);
    expect(q[1].asOf).toBe(new Date(1793998800 * 1000).toISOString());
    for (const x of q) expect(quoteSchema.safeParse(x).success).toBe(true);
  });

  it('fund profile: top-10 coverage, sector mapping, expense ratio, asset allocation', () => {
    const p = parseYahooFundProfile('spy', fixture('yahoo-quotesummary-spy.json'), NOW);
    expect(p.name).toBe('SPDR S&P 500 ETF Trust');
    expect(p.expenseRatio).toBeCloseTo(0.000945, 10);
    expect(p.holdings.map((h) => h.symbol)).toEqual(['NVDA', 'MSFT', 'BRK-B']);
    expect(p.holdingsCoverage).toBeCloseTo(0.0755 + 0.067 + 0.0165, 10);
    expect(p.totalHoldingsCount).toBeNull();
    expect(p.sectorWeights).toEqual({ 'Information Technology': 0.33, 'Health Care': 0.1, Financials: 0.13, 'Real Estate': 0.02 });
    expect(p.assetAllocation).toMatchObject({ stock: 0.9971, bond: 0, cash: 0.0029 });
    expect(fundProfileSchema.safeParse(p).success).toBe(true);
  });

  it('a non-fund (no fundProfile/topHoldings) is not_found', () => {
    expect(() => parseYahooFundProfile('AAPL', { price: { longName: 'Apple' } }, NOW)).toThrow(/no fund profile/);
  });

  it('search keeps equities/funds, drops indexes and non-Yahoo rows', () => {
    const r = parseYahooSearch(fixture('yahoo-search.json'));
    expect(r).toEqual([
      { symbol: 'VOO', name: 'Vanguard S&P 500 ETF', assetClass: 'fund', exchange: 'NYSEArca', source: 'yahoo' },
      { symbol: 'VTSAX', name: 'Vanguard Total Stock Market Index Fund Admiral', assetClass: 'fund', exchange: 'NAS', source: 'yahoo' },
    ]);
  });
});

describe('YahooProvider with a mocked client', () => {
  const client = (over: Partial<YahooLike>): YahooLike => ({
    quote: async () => fixture('yahoo-quote.json'),
    quoteSummary: async () => fixture('yahoo-quotesummary-spy.json'),
    search: async () => fixture('yahoo-search.json'),
    ...over,
  });

  it('passes validateResult:false and an abort signal', async () => {
    const quote = vi.fn(async () => fixture('yahoo-quote.json'));
    const y = new YahooProvider(() => client({ quote }), noSleep);
    await y.getQuotes(['AAPL', 'SPY']);
    const mod = (quote.mock.calls[0] as unknown[])[2] as { validateResult: boolean; fetchOptions: { signal: AbortSignal } };
    expect(mod.validateResult).toBe(false);
    expect(mod.fetchOptions.signal).toBeInstanceOf(AbortSignal);
  });

  it('library errors are retried, then open the breaker after 3 failed calls', async () => {
    const quote = vi.fn(async () => {
      throw new Error('fetch failed');
    });
    const y = new YahooProvider(() => client({ quote }), noSleep);
    for (let i = 0; i < 3; i++) await expect(y.getQuotes(['AAPL'])).rejects.toMatchObject({ kind: 'unavailable' });
    expect(quote).toHaveBeenCalledTimes(9);
    expect(breakerFor('yahoo').state).toBe('open');
    await expect(y.getQuotes(['AAPL'])).rejects.toMatchObject({ kind: 'circuit_open' });
    expect(quote).toHaveBeenCalledTimes(9);
  });

  it('"Too Many Requests" maps to rate_limited', async () => {
    const y = new YahooProvider(() => client({ search: async () => Promise.reject(new Error('Too Many Requests')) }), { ...noSleep, retries: 0 });
    await expect(y.search('vang')).rejects.toMatchObject({ kind: 'rate_limited' });
  });
});
