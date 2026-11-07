import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AlphaVantageProvider, detectAlphaVantageError, parseAlphaVantageEtfProfile, parseAlphaVantageQuote, parseAlphaVantageSearch } from '@/lib/providers/alphavantage';
import { parseExpenseRatio, parseWeights } from '@/lib/providers/parse';
import { fundProfileSchema } from '@/lib/api-contracts';
import { AlphaVantageBudget } from '@/lib/cache/budget';
import { MemoryCache } from '@/lib/cache/memory';
import { resetBreakersForTests } from '@/lib/providers/guard';
import { fixture, jsonResponse, noSleep } from './helpers';

const NOW = '2026-11-06T12:00:00.000Z';
beforeEach(() => resetBreakersForTests());

describe('Alpha Vantage in-band error detection', () => {
  it('daily-limit Information body -> rate_limited (daily)', () => {
    const e = detectAlphaVantageError(fixture('av-information-daily.json'));
    expect(e?.kind).toBe('rate_limited');
    expect(e?.message).toMatch(/daily/);
  });
  it('per-minute Note body -> rate_limited', () => {
    const e = detectAlphaVantageError(fixture('av-note-minute.json'));
    expect(e?.kind).toBe('rate_limited');
    expect(e?.message).not.toMatch(/daily/);
  });
  it('demo-key Information body -> invalid_response', () => {
    expect(detectAlphaVantageError(fixture('av-information-demo.json'))?.kind).toBe('invalid_response');
  });
  it('Error Message and empty bodies -> not_found; normal payload -> null', () => {
    expect(detectAlphaVantageError({ 'Error Message': 'Invalid API call.' })?.kind).toBe('not_found');
    expect(detectAlphaVantageError({})?.kind).toBe('not_found');
    expect(detectAlphaVantageError(fixture('av-global-quote.json'))).toBeNull();
  });
  it('rate-limit body is never parsed as a profile', () => {
    expect(() => parseAlphaVantageEtfProfile('QQQ', fixture('av-information-daily.json'), NOW)).toThrow(/rate limit/);
  });
});

describe('weight parsing', () => {
  it('decimal strings stay decimal', () => {
    expect(parseWeights(['0.0909', '0.0811', '0.005'])).toEqual({ scale: 'decimal', weights: [0.0909, 0.0811, 0.005] });
  });
  it('percent strings (with or without %) become decimals, decided for the whole list', () => {
    const r = parseWeights(['9.09', '8.11%', '0.5']);
    expect(r.scale).toBe('percent');
    expect(r.weights[0]).toBeCloseTo(0.0909, 10);
    expect(r.weights[1]).toBeCloseTo(0.0811, 10);
    expect(r.weights[2]).toBeCloseTo(0.005, 10); // a lone "0.5" here is 0.5%, not 50%
  });
  it('a list of small percents whose decimal sum exceeds 1 is treated as percent', () => {
    expect(parseWeights(['0.9', '0.8', '0.7']).scale).toBe('percent');
  });
  it('unparseable values are null, never 0', () => {
    expect(parseWeights(['n/a', '', null, '0.1']).weights).toEqual([null, null, null, 0.1]);
  });
  it('expense ratio: decimal, percent, and junk', () => {
    expect(parseExpenseRatio('0.002')).toBe(0.002);
    expect(parseExpenseRatio('0.20%')).toBeCloseTo(0.002, 10);
    expect(parseExpenseRatio('0.0945')).toBeCloseTo(0.000945, 10);
    expect(parseExpenseRatio('n/a')).toBeNull();
    expect(parseExpenseRatio(undefined)).toBeNull();
  });
});

describe('ETF_PROFILE parsing', () => {
  it('decimal fixture: holdings, coverage, truncation, sectors', () => {
    const { profile, truncated, weightScale } = parseAlphaVantageEtfProfile('qqq', fixture('av-etf-profile-decimal.json'), NOW);
    expect(weightScale).toBe('decimal');
    expect(profile.expenseRatio).toBe(0.002);
    expect(profile.holdings.map((h) => h.symbol)).toEqual(['NVDA', 'MSFT', 'AAPL', 'BRK-B']); // n/a row excluded
    expect(profile.holdingsCoverage).toBeCloseTo(0.0909 + 0.0811 + 0.0751 + 0.005, 10);
    expect(truncated).toBe(true);
    expect(profile.totalHoldingsCount).toBeNull();
    expect(profile.sectorWeights['Information Technology']).toBeCloseTo(0.513);
    expect(profile.sectorWeights['Communication Services']).toBeCloseTo(0.157);
    expect(profile).toMatchObject({ symbol: 'QQQ', source: 'alphavantage', stale: false, asOf: NOW });
    expect(fundProfileSchema.safeParse(profile).success).toBe(true);
  });
  it('percent fixture', () => {
    const { profile, weightScale } = parseAlphaVantageEtfProfile('QQQ', fixture('av-etf-profile-percent.json'), NOW);
    expect(weightScale).toBe('percent');
    expect(profile.expenseRatio).toBeCloseTo(0.002, 10);
    expect(profile.holdings[0].weight).toBeCloseTo(0.0909, 10);
    expect(profile.sectorWeights['Information Technology']).toBeCloseTo(0.513);
  });
  it('a full holdings list is marked untruncated with a count', () => {
    const body = { net_expense_ratio: '0.001', holdings: [{ symbol: 'A', description: 'A', weight: '0.6' }, { symbol: 'B', description: 'B', weight: '0.4' }] };
    const { truncated, profile } = parseAlphaVantageEtfProfile('X', body, NOW);
    expect(truncated).toBe(false);
    expect(profile.totalHoldingsCount).toBe(2);
  });

  const realQqq = path.join(__dirname, '..', '..', 'fixtures', 'alphavantage-etf-profile-QQQ.json');
  it.skipIf(!existsSync(realQqq))('parses the captured fixtures/alphavantage-etf-profile-QQQ.json', () => {
    const body = JSON.parse(readFileSync(realQqq, 'utf8')) as unknown;
    const { profile } = parseAlphaVantageEtfProfile('QQQ', body, NOW);
    expect(fundProfileSchema.safeParse(profile).success).toBe(true);
    expect(profile.holdings.length).toBeGreaterThan(0);
    expect(profile.holdingsCoverage).toBeGreaterThan(0);
  });
});

describe('GLOBAL_QUOTE / SYMBOL_SEARCH parsing', () => {
  it('quote', () => {
    expect(parseAlphaVantageQuote('IBM', fixture('av-global-quote.json'), NOW)).toMatchObject({ symbol: 'IBM', price: 251.23, asOf: '2026-11-05', source: 'alphavantage' });
    expect(() => parseAlphaVantageQuote('ZZZ', { 'Global Quote': {} }, NOW)).toThrow(/no quote/);
  });
  it('search maps types and skips nothing it understands', () => {
    const r = parseAlphaVantageSearch(fixture('av-symbol-search.json'));
    expect(r.map((x) => [x.symbol, x.assetClass])).toEqual([
      ['VOO', 'fund'],
      ['VFIAX', 'fund'],
      ['TSCO-LON', 'equity'],
    ]);
  });
});

describe('AlphaVantageProvider (mocked fetch)', () => {
  const mk = (fetchImpl: typeof fetch, dailyLimit = 25) => {
    const budget = new AlphaVantageBudget(new MemoryCache(), { dailyLimit, perMinute: 100 });
    return { budget, av: new AlphaVantageProvider({ apiKey: 'SECRET123', budget, fetchImpl, guard: noSleep }) };
  };

  it('sends the key only in the query string, consumes budget, and never leaks the key in errors', async () => {
    const urls: string[] = [];
    const fetchImpl = vi.fn(async (u: string | URL | Request) => {
      urls.push(String(u));
      return jsonResponse({ 'Error Message': 'bad' });
    }) as unknown as typeof fetch;
    const { av, budget } = mk(fetchImpl);
    const err = await av.getFundProfile('QQQ').catch((e: unknown) => e);
    expect(String((err as Error).message)).not.toContain('SECRET123');
    expect(urls[0]).toContain('function=ETF_PROFILE');
    expect((await budget.status()).used).toBe(1); // not_found is not retried
  });

  it('a daily rate-limit body is not retried and marks the budget exhausted', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(fixture('av-information-daily.json'))) as unknown as typeof fetch;
    const { av, budget } = mk(fetchImpl);
    await expect(av.getFundProfile('QQQ')).rejects.toMatchObject({ kind: 'rate_limited' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect((await budget.status()).remaining).toBe(0);
  });

  it('refuses to call at the budget reserve', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(fixture('av-etf-profile-decimal.json'))) as unknown as typeof fetch;
    const { av } = mk(fetchImpl, 3); // 3 - 0 > 2 -> one call allowed, then remaining 2 -> refuse
    await expect(av.getFundProfile('QQQ')).resolves.toMatchObject({ source: 'alphavantage' });
    await expect(av.getFundProfile('SPY')).rejects.toMatchObject({ kind: 'budget_exhausted' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('retries HTTP 5xx (each attempt costs budget)', async () => {
    let n = 0;
    const fetchImpl = vi.fn(async () => (n++ === 0 ? new Response('x', { status: 503 }) : jsonResponse(fixture('av-global-quote.json')))) as unknown as typeof fetch;
    const { av, budget } = mk(fetchImpl);
    await expect(av.getQuote('IBM')).resolves.toMatchObject({ price: 251.23 });
    expect((await budget.status()).used).toBe(2);
  });
});

describe('premium-endpoint body', () => {
  it('-> unavailable (not a rate limit)', () => {
    expect(detectAlphaVantageError({ Information: 'Thank you for using Alpha Vantage! This is a premium endpoint. You may subscribe to any of the premium plans.' })?.kind).toBe('unavailable');
  });
});
