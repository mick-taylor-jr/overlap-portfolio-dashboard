/**
 * Alpha Vantage adapter: ETF_PROFILE, GLOBAL_QUOTE, SYMBOL_SEARCH.
 *
 * Verified against live docs/demo (2026-11-06): non-error throttling/plan problems come back
 * as HTTP 200 with a single top-level "Information" (or historically "Note") string, e.g. the
 * demo-key notice. Those bodies are detected and thrown as ProviderError, never parsed as data.
 *
 * NOT verified from here (no outbound network from the build shell): the exact ETF_PROFILE
 * payload. It is parsed defensively: weights may be decimal strings ("0.0718") or percent
 * ("7.18"/"7.18%"); scale is decided per list (see parseWeights). AV is not known to report a
 * total holdings count, so when the returned holdings cover < 98% of the fund we treat the list
 * as truncated and leave totalHoldingsCount null.
 *
 * Every HTTP attempt (including retries) consumes one unit of the daily budget.
 */
import { z } from 'zod';
import type { AlphaVantageBudget } from '@/lib/cache/budget';
import type { FundProfile, Holding, Quote, SymbolSearchResult } from '@/lib/types';
import { ProviderError, type FundProfileProvider, type PriceProvider, type SymbolSearchProvider } from './types';
import { guarded, type GuardOptions } from './guard';
import { fetchJson, HttpProviderError } from './http';
import { clamp01, parseExpenseRatio, parseWeights, toNumber } from './parse';
import { mapSectorWeights, normalizeTicker } from './sector-map';
import { isRetryable } from '@/lib/cache/resilience';

const BASE = 'https://www.alphavantage.co/query';
export const TRUNCATION_COVERAGE_THRESHOLD = 0.98;

/** Detect AV's in-band error bodies. Returns null for a normal payload. */
export function detectAlphaVantageError(body: unknown): ProviderError | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return new ProviderError('alphavantage', 'response was not a JSON object', 'invalid_response');
  }
  const b = body as Record<string, unknown>;
  const note = typeof b.Note === 'string' ? b.Note : undefined;
  const info = typeof b.Information === 'string' ? b.Information : undefined;
  const errMsg = typeof b['Error Message'] === 'string' ? b['Error Message'] : undefined;
  const text = note ?? info;
  if (text !== undefined) {
    if (/premium endpoint/i.test(text)) {
      return new ProviderError('alphavantage', 'endpoint requires a premium plan', 'unavailable');
    }
    if (/demo/i.test(text) && /api ?key/i.test(text)) {
      return new ProviderError('alphavantage', 'demo/invalid API key', 'invalid_response');
    }
    const daily = /per day|daily/i.test(text);
    return new ProviderError('alphavantage', daily ? 'daily rate limit reached' : 'rate limited', 'rate_limited');
  }
  if (errMsg !== undefined) return new ProviderError('alphavantage', 'invalid call or unknown symbol', 'not_found');
  if (Object.keys(b).length === 0) return new ProviderError('alphavantage', 'empty response', 'not_found');
  return null;
}

export const isDailyLimitError = (e: unknown) => e instanceof ProviderError && e.kind === 'rate_limited' && /daily/.test(e.message);

const etfProfileSchema = z.object({
  net_assets: z.unknown().optional(),
  net_expense_ratio: z.unknown().optional(),
  sectors: z.array(z.object({ sector: z.string(), weight: z.unknown() })).nullish(),
  holdings: z.array(z.object({ symbol: z.string().nullish(), description: z.string().nullish(), weight: z.unknown() })).nullish(),
  asset_allocation: z.record(z.string(), z.unknown()).nullish(),
});

export interface ParsedEtfProfile {
  profile: FundProfile;
  truncated: boolean;
  weightScale: 'decimal' | 'percent';
}

export function parseAlphaVantageEtfProfile(symbol: string, body: unknown, nowIso: string): ParsedEtfProfile {
  const inband = detectAlphaVantageError(body);
  if (inband) throw inband;
  const parsed = etfProfileSchema.safeParse(body);
  if (!parsed.success) throw new ProviderError('alphavantage', 'ETF_PROFILE had unexpected shape', 'invalid_response');
  const d = parsed.data;
  if (!d.holdings && !d.sectors && d.net_expense_ratio === undefined) {
    throw new ProviderError('alphavantage', `${symbol} has no ETF profile`, 'not_found');
  }

  const rawHoldings = d.holdings ?? [];
  const { weights, scale } = parseWeights(rawHoldings.map((h) => h.weight));
  const holdings: Holding[] = [];
  rawHoldings.forEach((h, i) => {
    const w = weights[i];
    const sym = h.symbol?.trim();
    // "n/a" symbols (cash, futures, swaps) cannot be matched across funds: excluded from holdings and coverage.
    if (!sym || /^(n\/a|none|-+)$/i.test(sym) || w === null || w === undefined || w <= 0 || w > 1) return;
    holdings.push({ symbol: normalizeTicker(sym), name: h.description?.trim() || sym, weight: w });
  });
  const coverage = clamp01(holdings.reduce((a, h) => a + h.weight, 0));
  const truncated = coverage < TRUNCATION_COVERAGE_THRESHOLD;

  const sectorList = d.sectors ?? [];
  const sw = parseWeights(sectorList.map((s) => s.weight)).weights;
  const sectorEntries: Array<[string, number]> = [];
  sectorList.forEach((s, i) => {
    const w = sw[i];
    if (w !== null && w !== undefined) sectorEntries.push([s.sector, w]);
  });

  let assetAllocation: Record<string, number> | undefined;
  if (d.asset_allocation) {
    const keys = Object.keys(d.asset_allocation);
    const aw = parseWeights(keys.map((k) => d.asset_allocation?.[k])).weights;
    assetAllocation = {};
    keys.forEach((k, i) => {
      const w = aw[i];
      if (w !== null && w !== undefined && assetAllocation) assetAllocation[k] = w;
    });
  }

  const sym = normalizeTicker(symbol);
  return {
    truncated,
    weightScale: scale,
    profile: {
      symbol: sym,
      name: sym, // ETF_PROFILE carries no fund name; the chain enriches it from seed/search when possible
      expenseRatio: parseExpenseRatio(d.net_expense_ratio),
      holdings,
      sectorWeights: mapSectorWeights(sectorEntries),
      assetAllocation,
      holdingsCoverage: coverage,
      totalHoldingsCount: truncated ? null : holdings.length,
      source: 'alphavantage',
      asOf: nowIso,
      stale: false,
    },
  };
}

const globalQuoteSchema = z.object({
  'Global Quote': z.record(z.string(), z.unknown()),
});

export function parseAlphaVantageQuote(symbol: string, body: unknown, nowIso: string): Quote {
  const inband = detectAlphaVantageError(body);
  if (inband) throw inband;
  const p = globalQuoteSchema.safeParse(body);
  if (!p.success) throw new ProviderError('alphavantage', 'GLOBAL_QUOTE had unexpected shape', 'invalid_response');
  const g = p.data['Global Quote'];
  const price = toNumber(g['05. price']);
  if (price === null || price <= 0) throw new ProviderError('alphavantage', `no quote for ${symbol}`, 'not_found');
  const day = typeof g['07. latest trading day'] === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(g['07. latest trading day']) ? g['07. latest trading day'] : nowIso;
  return {
    symbol: normalizeTicker(typeof g['01. symbol'] === 'string' ? g['01. symbol'] : symbol),
    price,
    currency: 'USD', // GLOBAL_QUOTE does not report currency; we only look up US listings
    source: 'alphavantage',
    asOf: day, // trading day (YYYY-MM-DD), not an intraday timestamp
    stale: false,
  };
}

const symbolSearchSchema = z.object({ bestMatches: z.array(z.record(z.string(), z.unknown())) });

export function parseAlphaVantageSearch(body: unknown): SymbolSearchResult[] {
  const inband = detectAlphaVantageError(body);
  if (inband) throw inband;
  const p = symbolSearchSchema.safeParse(body);
  if (!p.success) throw new ProviderError('alphavantage', 'SYMBOL_SEARCH had unexpected shape', 'invalid_response');
  const out: SymbolSearchResult[] = [];
  for (const m of p.data.bestMatches) {
    const sym = m['1. symbol'];
    const name = m['2. name'];
    const type = typeof m['3. type'] === 'string' ? m['3. type'].toLowerCase() : '';
    const region = typeof m['4. region'] === 'string' ? m['4. region'] : undefined;
    if (typeof sym !== 'string' || typeof name !== 'string') continue;
    const assetClass = type === 'equity' ? 'equity' : type === 'etf' || type.includes('fund') ? 'fund' : null;
    if (!assetClass) continue;
    out.push({ symbol: normalizeTicker(sym), name, assetClass, exchange: region, source: 'alphavantage' });
  }
  return out;
}

export interface AlphaVantageDeps {
  apiKey: string;
  budget: AlphaVantageBudget;
  fetchImpl?: typeof fetch;
  guard?: GuardOptions;
  now?: () => Date;
}

/** In-band rate-limit bodies are not retried: a retry would just burn budget. HTTP 429/5xx are. */
const avShouldRetry = (err: unknown) => !(err instanceof ProviderError && !(err instanceof HttpProviderError) && err.kind === 'rate_limited') && isRetryable(err);

export class AlphaVantageProvider implements PriceProvider, FundProfileProvider, SymbolSearchProvider {
  readonly name = 'alphavantage';
  constructor(private deps: AlphaVantageDeps) {}

  private nowIso() {
    return (this.deps.now?.() ?? new Date()).toISOString();
  }

  /** One budgeted HTTP call; parse() runs inside the guard so in-band errors count as failures. */
  private async call<T>(params: Record<string, string>, parse: (body: unknown) => T): Promise<T> {
    try {
      return await guarded(
        'alphavantage',
        async (signal) => {
          const decision = await this.deps.budget.tryConsume();
          if (!decision.ok) {
            throw new ProviderError('alphavantage', decision.reason === 'per_minute' ? 'per-minute limit reached' : 'daily budget reserve reached', 'budget_exhausted');
          }
          const qs = new URLSearchParams({ ...params, apikey: this.deps.apiKey });
          const body = await fetchJson('alphavantage', `${BASE}?${qs.toString()}`, { signal, fetchImpl: this.deps.fetchImpl });
          return parse(body);
        },
        { ...this.deps.guard, shouldRetry: this.deps.guard?.shouldRetry ?? avShouldRetry },
      );
    } catch (err) {
      if (isDailyLimitError(err)) await this.deps.budget.markExhausted();
      throw err;
    }
  }

  async getQuotes(symbols: string[]): Promise<Quote[]> {
    // GLOBAL_QUOTE is one symbol per request (one budget unit each). Stop at the first budget refusal.
    const out: Quote[] = [];
    for (const s of symbols) {
      try {
        out.push(await this.getQuote(s));
      } catch (err) {
        if (err instanceof ProviderError && (err.kind === 'budget_exhausted' || err.kind === 'rate_limited' || err.kind === 'circuit_open')) break;
      }
    }
    if (!out.length && symbols.length) throw new ProviderError('alphavantage', 'no quotes returned', 'unavailable');
    return out;
  }

  getQuote(symbol: string): Promise<Quote> {
    return this.call({ function: 'GLOBAL_QUOTE', symbol }, (b) => parseAlphaVantageQuote(symbol, b, this.nowIso()));
  }

  async getFundProfile(symbol: string): Promise<FundProfile> {
    return (await this.getFundProfileDetailed(symbol)).profile;
  }

  getFundProfileDetailed(symbol: string): Promise<ParsedEtfProfile> {
    return this.call({ function: 'ETF_PROFILE', symbol }, (b) => parseAlphaVantageEtfProfile(symbol, b, this.nowIso()));
  }

  search(query: string): Promise<SymbolSearchResult[]> {
    return this.call({ function: 'SYMBOL_SEARCH', keywords: query }, parseAlphaVantageSearch);
  }
}
