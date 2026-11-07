/**
 * Best-effort asset-class guess for symbols typed or imported without one. The user can always
 * change it in the CSV preview and in the positions table; this only picks a sensible default.
 *
 * The fallback is 'equity', but that guess is NOT certain: the hard-coded fund list below is far from
 * complete. Analysis (lib/hooks/use-portfolio-analysis) therefore requests a fund profile for every
 * non-synthetic 'equity' too, and only treats it as a direct stock (no fund fee) once the server
 * answers with no profile. Prefer a search result's assetClass whenever one is available.
 */
import type { AssetClass, SymbolSearchResult } from '@/lib/types';
import { CRYPTO_TICKER_TO_ID as NORMALIZE_CRYPTO, normalizeTicker as normalizeSymbol } from '@/lib/normalize';

/** Common crypto tickers -> CoinGecko ids (CoinGecko prices by id, not ticker). */
export const CRYPTO_TICKER_TO_ID: Record<string, string> = {
  ...NORMALIZE_CRYPTO,
  BTC: 'bitcoin',
  ETH: 'ethereum',
  SOL: 'solana',
  XRP: 'ripple',
  ADA: 'cardano',
  DOGE: 'dogecoin',
  LTC: 'litecoin',
  DOT: 'polkadot',
  AVAX: 'avalanche-2',
  LINK: 'chainlink',
  BNB: 'binancecoin',
  USDC: 'usd-coin',
  USDT: 'tether',
  MATIC: 'matic-network',
  TRX: 'tron',
};
const CRYPTO_IDS = new Set(Object.values(CRYPTO_TICKER_TO_ID));

const CASH = new Set(['CASH', 'USD', 'SPAXX', 'FDRXX', 'VMFXX', 'SWVXX', 'FZFXX', 'SNOXX']);

const KNOWN_FUNDS = new Set(
  (
    'SPY VOO IVV VTI ITOT QQQ QQQM VGT XLK SCHD VYM VXUS IEFA AGG BND SCHG VUG ARKK IBIT GBTC FBTC ETHA ' +
    'VEA VWO IEMG EFA EEM IWM IJH IJR VB VO VTV VIG DIA RSP SCHX SCHB SCHF SCHA SPLG SPYG SPYV MGK XLF XLV XLE XLY XLI XLP XLU XLRE XLB XLC ' +
    'SMH SOXX TLT IEF SHY LQD HYG TIP BNDX VCIT VCSH MUB GLD IAU SLV VNQ VT ACWI JEPI JEPQ DGRO NOBL USMV MTUM QUAL COWZ AVUV'
  ).split(' '),
);

export interface AssetClassGuess {
  assetClass: AssetClass;
  symbol: string;
  /**
   * false when the class is only the 'equity' fallback (symbol not recognized). Such positions may
   * be ETFs/funds; the analysis probes /api/fund-profile for them rather than assuming 0% fees.
   */
  certain: boolean;
  /** Where the class came from. */
  basis: 'search' | 'known' | 'pattern' | 'fallback';
}

/**
 * Guess the asset class of a typed/imported symbol. When search results are supplied (from
 * /api/search, which reports each result's assetClass), an exact symbol match wins over heuristics.
 */
export function guessAssetClass(rawSymbol: string, searchResults?: readonly SymbolSearchResult[] | null): AssetClassGuess {
  const s = rawSymbol.trim();
  const up = s.toUpperCase();
  const hit = searchResults ? matchSearchResult(s, searchResults) : undefined;
  if (hit) {
    if (hit.assetClass === 'crypto') {
      const id = /^[a-z0-9-]+$/.test(hit.symbol) ? hit.symbol : (CRYPTO_TICKER_TO_ID[hit.symbol.toUpperCase()] ?? hit.symbol.toLowerCase());
      return { assetClass: 'crypto', symbol: id, certain: true, basis: 'search' };
    }
    return { assetClass: hit.assetClass, symbol: normalizeTicker(hit.symbol), certain: true, basis: 'search' };
  }
  if (CRYPTO_TICKER_TO_ID[up]) return { assetClass: 'crypto', symbol: CRYPTO_TICKER_TO_ID[up], certain: true, basis: 'known' };
  if (CRYPTO_IDS.has(s.toLowerCase())) return { assetClass: 'crypto', symbol: s.toLowerCase(), certain: true, basis: 'known' };
  if (CASH.has(up)) return { assetClass: 'cash', symbol: up, certain: true, basis: 'known' };
  if (KNOWN_FUNDS.has(up)) return { assetClass: 'fund', symbol: up, certain: true, basis: 'known' };
  // US mutual funds: five letters ending in X (VTSAX, FXAIX, SWPPX).
  if (/^[A-Z]{4}X$/.test(up)) return { assetClass: 'fund', symbol: up, certain: true, basis: 'pattern' };
  // Unknown: default to equity, but flagged uncertain so the analysis still probes for a fund profile.
  return { assetClass: 'equity', symbol: normalizeTicker(up), certain: false, basis: 'fallback' };
}

/** The search result whose symbol matches the typed symbol (ticker spelling-insensitive), if any. */
export function matchSearchResult(rawSymbol: string, results: readonly SymbolSearchResult[]): SymbolSearchResult | undefined {
  const t = rawSymbol.trim();
  if (!t) return undefined;
  const norm = normalizeTicker(t.toUpperCase());
  return results.find((r) => r.symbol.toLowerCase() === t.toLowerCase() || (r.assetClass !== 'crypto' && normalizeTicker(r.symbol.toUpperCase()) === norm));
}

/**
 * Should the analysis request a fund profile for this position? Funds always; 'equity' too, because
 * an unrecognized ETF lands there by default. A null profile on an equity means "direct stock".
 */
export function needsFundProfile(p: { assetClass: AssetClass; synthetic?: boolean }): boolean {
  return !p.synthetic && (p.assetClass === 'fund' || p.assetClass === 'equity');
}

/** One spelling per security (BRK.B, BRK/B -> BRK-B), shared with lib/normalize. */
export function normalizeTicker(s: string): string {
  return normalizeSymbol(s);
}

/** Symbol format the API routes accept. Crypto ids are lowercase slugs. */
export function isValidSymbol(symbol: string, assetClass: AssetClass): boolean {
  if (assetClass === 'crypto') return /^[a-z0-9-]{1,60}$/.test(symbol);
  return /^[A-Za-z0-9.\-^=]{1,15}$/.test(symbol);
}
