/**
 * Thin bridge to lib/normalize so the analysis code has one import point.
 * issuerKey groups share classes (GOOG + GOOGL -> Alphabet); toGicsSector maps provider labels.
 */
import { issuerKey, toGicsSector as toGics } from '@/lib/normalize';

/** Label for crypto and cash in the sector view: they have no GICS sector (not "undisclosed"). */
export const NON_EQUITY_SECTOR = 'No sector (crypto, cash)';

export function issuerKeyOf(symbol: string, name: string): { key: string; name: string } | null {
  if (!symbol) return null;
  // CoinGecko ids (lowercase slugs like 'bitcoin') are not tickers: keep them as they are.
  if (/^[a-z0-9-]+$/.test(symbol)) return { key: symbol, name: name || symbol };
  return issuerKey(symbol, name);
}

export function toGicsSector(label: string): string {
  return toGics(label);
}
