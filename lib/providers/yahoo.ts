/**
 * yahoo-finance2 v4 adapter (unofficial Yahoo API). All calls go through guarded():
 * circuit breaker + retry (max 2, backoff + jitter) + 5s timeout. We call the library with
 * { validateResult: false } and validate with our own Zod schemas instead, so a Yahoo schema
 * drift degrades one field rather than failing the whole call. (With validateResult:false the
 * library still attempts its type coercion, e.g. {raw, fmt} -> number, Date fields -> Date;
 * we accept both coerced and raw forms.)
 */
import YahooFinance from 'yahoo-finance2';
import { z } from 'zod';
import type { FundProfile, Holding, Quote, SymbolSearchResult } from '@/lib/types';
import { ProviderError, type FundProfileProvider, type PriceProvider, type SymbolSearchProvider } from './types';
import { guarded, type GuardOptions } from './guard';
import { clamp01, looseNumber, parseExpenseRatio, toIso, toNumber } from './parse';
import { mapSectorWeights, normalizeTicker } from './sector-map';

type ModOpts = { validateResult: false; fetchOptions?: RequestInit };

/** The subset of the yahoo-finance2 client we use (lets tests inject a fake). */
export interface YahooLike {
  quote(symbols: string[], opts: { return: 'array' }, mod: ModOpts): Promise<unknown>;
  quoteSummary(symbol: string, opts: { modules: Array<'fundProfile' | 'topHoldings' | 'price'> }, mod: ModOpts): Promise<unknown>;
  search(query: string, opts: { quotesCount: number; newsCount: number }, mod: ModOpts): Promise<unknown>;
}

let realClient: YahooLike | null = null;
function defaultClient(): YahooLike {
  if (!realClient) {
    const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'], versionCheck: false });
    realClient = {
      quote: (s, o, m) => yf.quote(s, o, m),
      quoteSummary: (s, o, m) => yf.quoteSummary(s, o, m),
      search: (q, o, m) => yf.search(q, o, m),
    };
  }
  return realClient;
}

/** Map library errors (HTTPError text etc.) onto ProviderError kinds. */
function mapError(err: unknown): unknown {
  if (err instanceof ProviderError) return err;
  const msg = err instanceof Error ? err.message : String(err);
  const name = err instanceof Error ? err.name : '';
  if (/too many requests|429|rate limit/i.test(msg)) return new ProviderError('yahoo', 'rate limited', 'rate_limited');
  if (/not found|no fundamentals|quote not found|invalid symbol/i.test(msg)) return new ProviderError('yahoo', 'symbol not found', 'not_found');
  if (name === 'FailedYahooValidationError' || name === 'InvalidOptionsError') return new ProviderError('yahoo', `invalid response (${name})`, 'invalid_response');
  return new ProviderError('yahoo', `request failed (${name || 'error'}: ${msg.slice(0, 120)})`, 'unavailable');
}

const quoteRow = z.object({
  symbol: z.string(),
  regularMarketPrice: looseNumber,
  currency: z.string().optional(),
  shortName: z.string().nullish(),
  longName: z.string().nullish(),
  regularMarketTime: z.unknown().optional(),
});
const quoteArray = z.array(z.unknown());

const holdingRow = z.object({ symbol: z.string().nullish(), holdingName: z.string().nullish(), holdingPercent: looseNumber });
const summarySchema = z.object({
  price: z.object({ longName: z.string().nullish(), shortName: z.string().nullish(), regularMarketTime: z.unknown().optional() }).partial().nullish(),
  fundProfile: z
    .object({
      feesExpensesInvestment: z.object({ annualReportExpenseRatio: z.unknown(), netExpRatio: z.unknown() }).partial().nullish(),
    })
    .partial()
    .nullish(),
  topHoldings: z
    .object({
      holdings: z.array(z.unknown()).nullish(),
      sectorWeightings: z.array(z.record(z.string(), z.unknown())).nullish(),
      stockPosition: z.unknown(),
      bondPosition: z.unknown(),
      cashPosition: z.unknown(),
      otherPosition: z.unknown(),
      preferredPosition: z.unknown(),
      convertiblePosition: z.unknown(),
    })
    .partial()
    .nullish(),
});

const searchSchema = z.object({ quotes: z.array(z.unknown()).default([]) });
const searchQuote = z.object({
  symbol: z.string(),
  quoteType: z.string().optional(),
  shortname: z.string().nullish(),
  longname: z.string().nullish(),
  exchange: z.string().nullish(),
  exchDisp: z.string().nullish(),
  isYahooFinance: z.literal(true),
});

export function parseYahooQuotes(raw: unknown, nowIso: string): Quote[] {
  const rows = quoteArray.safeParse(raw);
  if (!rows.success) throw new ProviderError('yahoo', 'quote response was not an array', 'invalid_response');
  const out: Quote[] = [];
  for (const r of rows.data) {
    const p = quoteRow.safeParse(r);
    if (!p.success || p.data.regularMarketPrice === null || p.data.regularMarketPrice <= 0) continue;
    out.push({
      symbol: normalizeTicker(p.data.symbol),
      price: p.data.regularMarketPrice,
      currency: p.data.currency ?? 'USD',
      name: p.data.longName ?? p.data.shortName ?? undefined,
      source: 'yahoo',
      asOf: toIso(p.data.regularMarketTime, nowIso),
      stale: false,
    });
  }
  return out;
}

export function parseYahooFundProfile(symbol: string, raw: unknown, nowIso: string): FundProfile {
  const parsed = summarySchema.safeParse(raw);
  if (!parsed.success) throw new ProviderError('yahoo', 'quoteSummary response had unexpected shape', 'invalid_response');
  const { price, fundProfile, topHoldings } = parsed.data;
  if (!topHoldings && !fundProfile) throw new ProviderError('yahoo', `${symbol} has no fund profile (not a fund?)`, 'not_found');

  const holdings: Holding[] = [];
  for (const h of topHoldings?.holdings ?? []) {
    const p = holdingRow.safeParse(h);
    if (!p.success) continue;
    const w = p.data.holdingPercent;
    const sym = p.data.symbol?.trim();
    // Holdings without a symbol cannot be matched across funds: excluded from holdings AND coverage.
    if (!sym || w === null || w <= 0 || w > 1) continue;
    holdings.push({ symbol: normalizeTicker(sym), name: p.data.holdingName ?? sym, weight: w });
  }
  const coverage = clamp01(holdings.reduce((a, h) => a + h.weight, 0));

  // sectorWeightings is an array of single-key objects: [{ technology: 0.3 }, { healthcare: 0.1 }, ...]
  const sectorEntries: Array<[string, number]> = [];
  for (const obj of topHoldings?.sectorWeightings ?? []) {
    for (const [k, v] of Object.entries(obj)) {
      const n = toNumber(v);
      if (n !== null) sectorEntries.push([k, Math.max(0, n)]);
    }
  }

  const alloc: Record<string, number> = {};
  const allocPairs: Array<[string, unknown]> = [
    ['stock', topHoldings?.stockPosition],
    ['bond', topHoldings?.bondPosition],
    ['cash', topHoldings?.cashPosition],
    ['other', topHoldings?.otherPosition],
    ['preferred', topHoldings?.preferredPosition],
    ['convertible', topHoldings?.convertiblePosition],
  ];
  for (const [k, v] of allocPairs) {
    const n = toNumber(v);
    // Funds sometimes report a small negative cash position (pending settlements, e.g. VOO cash
    // -0.12%). Look-through math needs non-negative weights, so negatives are floored at 0; the
    // remaining weights are then rescaled below so they still sum to at most 1.
    if (n !== null) alloc[k] = Math.max(0, n);
  }
  const allocSum = Object.values(alloc).reduce((s, x) => s + x, 0);
  if (allocSum > 1) for (const k of Object.keys(alloc)) alloc[k] = alloc[k] / allocSum;

  const fees = fundProfile?.feesExpensesInvestment;
  const expenseRatio = parseExpenseRatio(fees?.annualReportExpenseRatio) ?? parseExpenseRatio(fees?.netExpRatio);

  return {
    symbol: normalizeTicker(symbol),
    name: price?.longName ?? price?.shortName ?? normalizeTicker(symbol),
    expenseRatio,
    holdings,
    sectorWeights: mapSectorWeights(sectorEntries),
    assetAllocation: Object.keys(alloc).length ? alloc : undefined,
    holdingsCoverage: coverage,
    // Yahoo returns only the top ~10, and does not report the fund's total holdings count.
    totalHoldingsCount: null,
    source: 'yahoo',
    asOf: nowIso,
    stale: false,
  };
}

function mapQuoteType(t: string | undefined): SymbolSearchResult['assetClass'] | null {
  switch (t) {
    case 'EQUITY':
      return 'equity';
    case 'ETF':
    case 'MUTUALFUND':
    case 'MONEY_MARKET':
      return 'fund';
    default:
      return null; // indexes, options, futures, currencies; crypto comes from CoinGecko (ids, not tickers)
  }
}

export function parseYahooSearch(raw: unknown): SymbolSearchResult[] {
  const parsed = searchSchema.safeParse(raw);
  if (!parsed.success) throw new ProviderError('yahoo', 'search response had unexpected shape', 'invalid_response');
  const out: SymbolSearchResult[] = [];
  for (const q of parsed.data.quotes) {
    const p = searchQuote.safeParse(q);
    if (!p.success) continue;
    const assetClass = mapQuoteType(p.data.quoteType);
    if (!assetClass) continue;
    out.push({
      symbol: normalizeTicker(p.data.symbol),
      name: p.data.longname ?? p.data.shortname ?? p.data.symbol,
      assetClass,
      exchange: p.data.exchDisp ?? p.data.exchange ?? undefined,
      source: 'yahoo',
    });
  }
  return out;
}

export class YahooProvider implements PriceProvider, FundProfileProvider, SymbolSearchProvider {
  readonly name = 'yahoo';
  constructor(private client: () => YahooLike = defaultClient, private guard: GuardOptions = {}, private now: () => Date = () => new Date()) {}

  private call<T>(fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
    return guarded(
      'yahoo',
      async (signal) => {
        try {
          return await fn(signal);
        } catch (err) {
          throw mapError(err);
        }
      },
      this.guard,
    );
  }

  async getQuotes(symbols: string[]): Promise<Quote[]> {
    if (!symbols.length) return [];
    const raw = await this.call((signal) => this.client().quote(symbols, { return: 'array' }, { validateResult: false, fetchOptions: { signal } }));
    return parseYahooQuotes(raw, this.now().toISOString());
  }

  async getFundProfile(symbol: string): Promise<FundProfile> {
    const raw = await this.call((signal) =>
      this.client().quoteSummary(symbol, { modules: ['fundProfile', 'topHoldings', 'price'] }, { validateResult: false, fetchOptions: { signal } }),
    );
    return parseYahooFundProfile(symbol, raw, this.now().toISOString());
  }

  async search(query: string): Promise<SymbolSearchResult[]> {
    const raw = await this.call((signal) => this.client().search(query, { quotesCount: 10, newsCount: 0 }, { validateResult: false, fetchOptions: { signal } }));
    return parseYahooSearch(raw);
  }
}
