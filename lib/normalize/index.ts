/**
 * Identifier and label normalization. This is where overlap tools silently go wrong, so every
 * rule here is explicit, table-driven and unit tested.
 *
 * NOTE: this module must only use erasable TypeScript syntax and `import type`, because
 * scripts/seed/build.mjs imports it directly with Node's built-in type stripping.
 */
import type { GicsSector } from '@/lib/types';

// ---------------------------------------------------------------------------------------------
// Tickers
// ---------------------------------------------------------------------------------------------

/**
 * Normalize a ticker to the canonical form used everywhere in the app:
 *  - trims and uppercases ('brk.b' -> 'BRK-B')
 *  - share-class separators '.', '/', and inner whitespace become '-' ('BRK/B', 'BRK B' -> 'BRK-B')
 *  - a '.' BETWEEN TWO DIGITS is a decimal point and is kept (synthetic bond keys like
 *    'UST-4.625-2035-02-15')
 *  - exchange prefixes keep their colon, with surrounding spaces removed ('AMS: ASML' -> 'AMS:ASML')
 *  - repeated or trailing separators are collapsed/removed
 * Returns '' for blank input (callers must treat '' as invalid, never as a real symbol).
 */
export function normalizeTicker(raw: string): string {
  let s = raw.trim().toUpperCase();
  if (!s) return '';
  s = s.replace(/\s*:\s*/g, ':');
  s = s.replace(/(\d)\.(?=\d)/g, '$1\u0000'); // protect decimal points
  s = s.replace(/[./\s]+/g, '-');
  s = s.replace(/\u0000/g, '.');
  s = s.replace(/-{2,}/g, '-').replace(/^-+|-+$/g, '');
  return s;
}

// ---------------------------------------------------------------------------------------------
// Issuers (share-class grouping)
// ---------------------------------------------------------------------------------------------

export interface IssuerGroup {
  key: string;
  name: string;
  symbols: string[];
}

/**
 * Companies with more than one listed share class. Used for "group by issuer".
 * Symbols are in normalizeTicker form.
 */
export const ISSUER_GROUPS: readonly IssuerGroup[] = [
  { key: 'ALPHABET', name: 'Alphabet Inc.', symbols: ['GOOGL', 'GOOG'] },
  { key: 'BERKSHIRE-HATHAWAY', name: 'Berkshire Hathaway Inc.', symbols: ['BRK-A', 'BRK-B'] },
  { key: 'FOX-CORP', name: 'Fox Corporation', symbols: ['FOXA', 'FOX'] },
  { key: 'NEWS-CORP', name: 'News Corporation', symbols: ['NWSA', 'NWS'] },
  { key: 'UNDER-ARMOUR', name: 'Under Armour, Inc.', symbols: ['UAA', 'UA'] },
  { key: 'BROWN-FORMAN', name: 'Brown-Forman Corporation', symbols: ['BF-A', 'BF-B'] },
  { key: 'LENNAR', name: 'Lennar Corporation', symbols: ['LEN', 'LEN-B'] },
  { key: 'HEICO', name: 'HEICO Corporation', symbols: ['HEI', 'HEI-A'] },
  { key: 'ZILLOW', name: 'Zillow Group, Inc.', symbols: ['Z', 'ZG'] },
];

const issuerBySymbol = new Map<string, IssuerGroup>();
for (const g of ISSUER_GROUPS) for (const s of g.symbols) issuerBySymbol.set(s, g);

/**
 * Issuer grouping key for a security. Share classes of the same company share a key
 * (GOOG/GOOGL -> 'ALPHABET'); everything else passes through as its normalized symbol.
 */
export function issuerKey(symbol: string, name?: string): { key: string; name: string } {
  const sym = normalizeTicker(symbol);
  const g = issuerBySymbol.get(sym);
  if (g) return { key: g.key, name: g.name };
  return { key: sym, name: name && name.trim() ? name.trim() : sym };
}

// ---------------------------------------------------------------------------------------------
// Crypto
// ---------------------------------------------------------------------------------------------

export type CryptoUnderlyingId = 'bitcoin' | 'ethereum';

export interface CryptoEtfEntry {
  /** CoinGecko id of the underlying asset. */
  underlying: CryptoUnderlyingId;
  /** 'spot' funds hold the coin; 'futures' funds hold derivatives and are NOT looked through. */
  kind: 'spot' | 'futures';
  issuer: string;
  note?: string;
}

/**
 * Static, documented table of US crypto exchange-traded products. Spot funds are mapped to their
 * underlying so crypto exposure is not hidden inside the fund bucket.
 * BITO is listed for transparency but flagged as futures-based: it is excluded from look-through
 * (it holds CME futures + T-bills, not bitcoin, and its exposure differs from spot).
 */
export const CRYPTO_ETF_UNDERLYING: Readonly<Record<string, CryptoEtfEntry>> = {
  IBIT: { underlying: 'bitcoin', kind: 'spot', issuer: 'iShares (BlackRock)' },
  FBTC: { underlying: 'bitcoin', kind: 'spot', issuer: 'Fidelity' },
  GBTC: { underlying: 'bitcoin', kind: 'spot', issuer: 'Grayscale' },
  BITB: { underlying: 'bitcoin', kind: 'spot', issuer: 'Bitwise' },
  ARKB: { underlying: 'bitcoin', kind: 'spot', issuer: 'ARK 21Shares' },
  HODL: { underlying: 'bitcoin', kind: 'spot', issuer: 'VanEck' },
  BTCO: { underlying: 'bitcoin', kind: 'spot', issuer: 'Invesco Galaxy' },
  EZBC: { underlying: 'bitcoin', kind: 'spot', issuer: 'Franklin Templeton' },
  ETHA: { underlying: 'ethereum', kind: 'spot', issuer: 'iShares (BlackRock)' },
  FETH: { underlying: 'ethereum', kind: 'spot', issuer: 'Fidelity' },
  ETHE: { underlying: 'ethereum', kind: 'spot', issuer: 'Grayscale' },
  BITO: {
    underlying: 'bitcoin',
    kind: 'futures',
    issuer: 'ProShares',
    note: 'Futures-based (CME bitcoin futures). Not looked through to spot bitcoin.',
  },
};

/** Underlying CoinGecko id for a SPOT crypto ETF, or null (futures funds and unknowns -> null). */
export function cryptoEtfUnderlying(symbol: string): CryptoUnderlyingId | null {
  const e = CRYPTO_ETF_UNDERLYING[normalizeTicker(symbol)];
  return e && e.kind === 'spot' ? e.underlying : null;
}

/**
 * Static ticker -> CoinGecko id fallback, used when the live /search resolver is unavailable.
 * CoinGecko uses ids, not tickers; several coins share tickers, so only unambiguous majors are listed.
 */
export const CRYPTO_TICKER_TO_ID: Readonly<Record<string, string>> = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  SOL: 'solana',
  ADA: 'cardano',
  XRP: 'ripple',
  DOGE: 'dogecoin',
  AVAX: 'avalanche-2',
  LINK: 'chainlink',
  DOT: 'polkadot',
  LTC: 'litecoin',
  USDC: 'usd-coin',
  USDT: 'tether',
};

const KNOWN_CRYPTO_IDS = new Set(Object.values(CRYPTO_TICKER_TO_ID));

/**
 * Resolve a user-typed crypto ticker or id to a CoinGecko id using the static table.
 * Accepts 'btc', 'BTC', 'BTC-USD', or an id already in the table ('bitcoin'). Returns null if unknown.
 */
export function cryptoIdForTicker(input: string): string | null {
  const t = input.trim();
  if (!t) return null;
  if (KNOWN_CRYPTO_IDS.has(t.toLowerCase())) return t.toLowerCase();
  const sym = normalizeTicker(t).replace(/-USD$/, '');
  return CRYPTO_TICKER_TO_ID[sym] ?? null;
}

// ---------------------------------------------------------------------------------------------
// Sectors
// ---------------------------------------------------------------------------------------------

export type GicsName = Exclude<GicsSector, 'Unresolved / not disclosed'>;

export interface SectorLabelMapping {
  /** Label as a provider emits it. */
  label: string;
  /** Which provider/scheme uses this label. */
  provider: string;
  gics: GicsName;
  /** Caveat shown on the methodology page (e.g. non-GICS scheme). */
  note?: string;
}

const ICB_NOTE = 'ICB/Morningstar-style scheme; approximate GICS equivalent (classification boundaries differ).';

/**
 * Documented sector label mapping. Exported so the methodology page can render it.
 * Matching is case-insensitive and ignores punctuation/underscores/extra spaces.
 */
export const SECTOR_LABEL_MAPPINGS: readonly SectorLabelMapping[] = [
  // GICS names themselves (issuer pages: SSGA, Schwab, Vanguard S&P funds, iShares)
  { label: 'Information Technology', provider: 'GICS', gics: 'Information Technology' },
  { label: 'Health Care', provider: 'GICS', gics: 'Health Care' },
  { label: 'Financials', provider: 'GICS', gics: 'Financials' },
  { label: 'Consumer Discretionary', provider: 'GICS', gics: 'Consumer Discretionary' },
  { label: 'Communication Services', provider: 'GICS', gics: 'Communication Services' },
  { label: 'Industrials', provider: 'GICS', gics: 'Industrials' },
  { label: 'Consumer Staples', provider: 'GICS', gics: 'Consumer Staples' },
  { label: 'Energy', provider: 'GICS', gics: 'Energy' },
  { label: 'Utilities', provider: 'GICS', gics: 'Utilities' },
  { label: 'Real Estate', provider: 'GICS', gics: 'Real Estate' },
  { label: 'Materials', provider: 'GICS', gics: 'Materials' },
  // Yahoo (yahoo-finance2 topHoldings.sectorWeightings keys)
  { label: 'technology', provider: 'Yahoo', gics: 'Information Technology' },
  { label: 'healthcare', provider: 'Yahoo', gics: 'Health Care' },
  { label: 'financial_services', provider: 'Yahoo', gics: 'Financials' },
  { label: 'consumer_cyclical', provider: 'Yahoo', gics: 'Consumer Discretionary' },
  { label: 'consumer_defensive', provider: 'Yahoo', gics: 'Consumer Staples' },
  { label: 'basic_materials', provider: 'Yahoo', gics: 'Materials' },
  { label: 'communication_services', provider: 'Yahoo', gics: 'Communication Services' },
  { label: 'realestate', provider: 'Yahoo', gics: 'Real Estate' },
  { label: 'utilities', provider: 'Yahoo', gics: 'Utilities' },
  { label: 'energy', provider: 'Yahoo', gics: 'Energy' },
  { label: 'industrials', provider: 'Yahoo', gics: 'Industrials' },
  // Alpha Vantage ETF_PROFILE (uppercase GICS-style names; casing per docs/DATA_SOURCES.md)
  { label: 'INFORMATION TECHNOLOGY', provider: 'Alpha Vantage', gics: 'Information Technology' },
  { label: 'HEALTH CARE', provider: 'Alpha Vantage', gics: 'Health Care' },
  { label: 'FINANCIALS', provider: 'Alpha Vantage', gics: 'Financials' },
  { label: 'CONSUMER DISCRETIONARY', provider: 'Alpha Vantage', gics: 'Consumer Discretionary' },
  { label: 'COMMUNICATION SERVICES', provider: 'Alpha Vantage', gics: 'Communication Services' },
  { label: 'INDUSTRIALS', provider: 'Alpha Vantage', gics: 'Industrials' },
  { label: 'CONSUMER STAPLES', provider: 'Alpha Vantage', gics: 'Consumer Staples' },
  { label: 'ENERGY', provider: 'Alpha Vantage', gics: 'Energy' },
  { label: 'UTILITIES', provider: 'Alpha Vantage', gics: 'Utilities' },
  { label: 'REAL ESTATE', provider: 'Alpha Vantage', gics: 'Real Estate' },
  { label: 'MATERIALS', provider: 'Alpha Vantage', gics: 'Materials' },
  // Starter pack CSV
  { label: 'Technology', provider: 'Starter pack / ICB', gics: 'Information Technology' },
  { label: 'Healthcare', provider: 'Starter pack', gics: 'Health Care' },
  // iShares
  { label: 'Communication', provider: 'iShares', gics: 'Communication Services' },
  // ICB / Morningstar (Vanguard FTSE & Morningstar-index fact sheets)
  { label: 'Telecommunications', provider: 'ICB (Vanguard fact sheets)', gics: 'Communication Services', note: ICB_NOTE },
  { label: 'Basic Materials', provider: 'ICB (Vanguard fact sheets)', gics: 'Materials', note: ICB_NOTE },
  // Other common variants
  { label: 'Financial Services', provider: 'Morningstar/Yahoo display', gics: 'Financials' },
  { label: 'Consumer Cyclical', provider: 'Morningstar/Yahoo display', gics: 'Consumer Discretionary' },
  { label: 'Consumer Defensive', provider: 'Morningstar/Yahoo display', gics: 'Consumer Staples' },
  { label: 'Telecommunication Services', provider: 'Legacy GICS (pre-2018)', gics: 'Communication Services' },
  { label: 'Telecom', provider: 'Various', gics: 'Communication Services' },
  { label: 'Tech', provider: 'Various', gics: 'Information Technology' },
];

function sectorKey(label: string): string {
  return label
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '');
}

const sectorLookup = new Map<string, GicsName>();
for (const m of SECTOR_LABEL_MAPPINGS) sectorLookup.set(sectorKey(m.label), m.gics);

/** Map any provider sector label to one of the 11 GICS sector names; unknown labels -> 'Other'. */
export function toGicsSector(label: string | null | undefined): GicsName {
  if (!label) return 'Other';
  return sectorLookup.get(sectorKey(label)) ?? 'Other';
}

/**
 * Map a provider's { label: weight } record onto GICS names, summing labels that collide.
 * Weights are passed through unchanged (convert percent -> decimal before calling).
 * Non-finite or negative weights are dropped (never coerced to 0).
 */
export function mapSectorWeights(weights: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [label, w] of Object.entries(weights)) {
    if (!Number.isFinite(w) || w < 0) continue;
    const g = toGicsSector(label);
    out[g] = (out[g] ?? 0) + w;
  }
  return out;
}
