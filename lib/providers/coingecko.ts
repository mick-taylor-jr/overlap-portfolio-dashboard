/**
 * CoinGecko Demo API adapter. Base URL https://api.coingecko.com/api/v3, key in the
 * `x-cg-demo-api-key` header (verified on docs.coingecko.com 2026-11-06). /simple/price is batched
 * with comma-separated ids; CoinGecko uses coin ids ("bitcoin"), so tickers are resolved via a
 * static table first and /search second. UI must show "Powered by CoinGecko" attribution.
 */
import { z } from 'zod';
import type { SymbolSearchResult } from '@/lib/types';
import { ProviderError, type CryptoPrice, type CryptoProvider, type SymbolSearchProvider } from './types';
import { guarded, type GuardOptions } from './guard';
import { fetchJson } from './http';
import { toIso } from './parse';

export const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';

/** Ticker -> id for the most common coins, so resolution works with no key and no network. */
export const STATIC_TICKER_TO_ID: Readonly<Record<string, string>> = {
  btc: 'bitcoin',
  eth: 'ethereum',
  usdt: 'tether',
  usdc: 'usd-coin',
  bnb: 'binancecoin',
  sol: 'solana',
  xrp: 'ripple',
  ada: 'cardano',
  doge: 'dogecoin',
  trx: 'tron',
  dot: 'polkadot',
  ltc: 'litecoin',
  link: 'chainlink',
  avax: 'avalanche-2',
  xlm: 'stellar',
  bch: 'bitcoin-cash',
  shib: 'shiba-inu',
  atom: 'cosmos',
  uni: 'uniswap',
  pol: 'polygon-ecosystem-token',
  dai: 'dai',
};
const STATIC_IDS = new Set(Object.values(STATIC_TICKER_TO_ID));

/** Resolve without network. Returns null when the input is neither a known ticker nor a known id. */
export function resolveStatic(tickerOrId: string): string | null {
  const k = tickerOrId.trim().toLowerCase();
  if (STATIC_IDS.has(k)) return k;
  return STATIC_TICKER_TO_ID[k] ?? null;
}

const priceSchema = z.record(z.string(), z.object({ usd: z.number().optional(), last_updated_at: z.number().optional() }).passthrough());
const searchSchema = z.object({
  coins: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      symbol: z.string(),
      market_cap_rank: z.number().nullish(),
    }),
  ),
});
type SearchCoin = z.infer<typeof searchSchema>['coins'][number];

export function parseSimplePrice(body: unknown, ids: string[], nowIso: string): CryptoPrice[] {
  const p = priceSchema.safeParse(body);
  if (!p.success) throw new ProviderError('coingecko', '/simple/price had unexpected shape', 'invalid_response');
  const out: CryptoPrice[] = [];
  for (const id of ids) {
    const row = p.data[id];
    if (!row || typeof row.usd !== 'number' || !(row.usd > 0)) continue;
    out.push({ id, usd: row.usd, source: 'coingecko', asOf: toIso(row.last_updated_at, nowIso), stale: false });
  }
  return out;
}

/** Exact id match wins; otherwise the symbol match with the best (lowest) market-cap rank. */
export function pickCoinId(query: string, body: unknown): string | null {
  const p = searchSchema.safeParse(body);
  if (!p.success) throw new ProviderError('coingecko', '/search had unexpected shape', 'invalid_response');
  const q = query.trim().toLowerCase();
  const byId = p.data.coins.find((c) => c.id === q);
  if (byId) return byId.id;
  const bySymbol = p.data.coins.filter((c) => c.symbol.toLowerCase() === q);
  if (!bySymbol.length) return null;
  const rank = (c: SearchCoin) => c.market_cap_rank ?? Number.POSITIVE_INFINITY;
  return [...bySymbol].sort((a, b) => rank(a) - rank(b))[0].id;
}

export function parseCoinSearch(body: unknown, limit = 5): SymbolSearchResult[] {
  const p = searchSchema.safeParse(body);
  if (!p.success) throw new ProviderError('coingecko', '/search had unexpected shape', 'invalid_response');
  return p.data.coins.slice(0, limit).map((c) => ({
    symbol: c.id, // positions store the CoinGecko id for crypto
    name: `${c.name} (${c.symbol.toUpperCase()})`,
    assetClass: 'crypto' as const,
    source: 'coingecko',
  }));
}

export interface CoinGeckoDeps {
  apiKey: string;
  fetchImpl?: typeof fetch;
  guard?: GuardOptions;
  now?: () => Date;
}

export class CoinGeckoProvider implements CryptoProvider, SymbolSearchProvider {
  readonly name = 'coingecko';
  constructor(private deps: CoinGeckoDeps) {}

  private get(path: string, params: Record<string, string>): Promise<unknown> {
    const qs = new URLSearchParams(params).toString();
    return guarded(
      'coingecko',
      (signal) => fetchJson('coingecko', `${COINGECKO_BASE}${path}?${qs}`, { signal, fetchImpl: this.deps.fetchImpl, headers: { 'x-cg-demo-api-key': this.deps.apiKey } }),
      this.deps.guard,
    );
  }

  async getPrices(ids: string[]): Promise<CryptoPrice[]> {
    if (!ids.length) return [];
    const body = await this.get('/simple/price', { ids: ids.join(','), vs_currencies: 'usd', include_last_updated_at: 'true' });
    return parseSimplePrice(body, ids, (this.deps.now?.() ?? new Date()).toISOString());
  }

  async resolveId(tickerOrId: string): Promise<string | null> {
    const s = resolveStatic(tickerOrId);
    if (s) return s;
    return pickCoinId(tickerOrId, await this.get('/search', { query: tickerOrId.trim().toLowerCase() }));
  }

  async search(query: string): Promise<SymbolSearchResult[]> {
    return parseCoinSearch(await this.get('/search', { query }));
  }
}
