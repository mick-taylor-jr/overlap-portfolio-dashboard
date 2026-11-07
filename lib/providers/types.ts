import type { FundProfile, Quote, SymbolSearchResult } from '@/lib/types';

/**
 * Provider-adapter contracts. Each adapter:
 *  - validates every external response with Zod (external data is untrusted),
 *  - returns normalized objects carrying { source, asOf, stale },
 *  - throws ProviderError on failure so the chain can fall through to the next provider.
 */

export class ProviderError extends Error {
  constructor(
    public provider: string,
    message: string,
    public kind: 'timeout' | 'rate_limited' | 'budget_exhausted' | 'not_found' | 'invalid_response' | 'unavailable' | 'circuit_open',
  ) {
    super(`[${provider}] ${message}`);
    this.name = 'ProviderError';
  }
}

export interface PriceProvider {
  name: string;
  getQuotes(symbols: string[]): Promise<Quote[]>;
}

export interface FundProfileProvider {
  name: string;
  getFundProfile(symbol: string): Promise<FundProfile>;
}

export interface CryptoPrice {
  id: string; // coingecko id
  usd: number;
  source: string;
  asOf: string;
  stale: boolean;
}

export interface CryptoProvider {
  name: string;
  getPrices(ids: string[]): Promise<CryptoPrice[]>;
  /** Resolve a ticker like BTC to a coingecko id like 'bitcoin'. */
  resolveId(tickerOrId: string): Promise<string | null>;
}

export interface SymbolSearchProvider {
  name: string;
  search(query: string): Promise<SymbolSearchResult[]>;
}

export interface ProviderStatus {
  name: string;
  configured: boolean;
  circuit: 'closed' | 'open' | 'half-open';
  lastError?: string;
  lastSuccessAt?: string;
}
