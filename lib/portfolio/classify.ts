/**
 * Best-effort asset-class guess for symbols typed or imported without one. The user can always
 * change it in the CSV preview and in the positions table; this only picks a sensible default.
 */
import type { AssetClass } from '@/lib/types';
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

export function guessAssetClass(rawSymbol: string): { assetClass: AssetClass; symbol: string } {
  const s = rawSymbol.trim();
  const up = s.toUpperCase();
  if (CRYPTO_TICKER_TO_ID[up]) return { assetClass: 'crypto', symbol: CRYPTO_TICKER_TO_ID[up] };
  if (CRYPTO_IDS.has(s.toLowerCase())) return { assetClass: 'crypto', symbol: s.toLowerCase() };
  if (CASH.has(up)) return { assetClass: 'cash', symbol: up };
  if (KNOWN_FUNDS.has(up)) return { assetClass: 'fund', symbol: up };
  // US mutual funds: five letters ending in X (VTSAX, FXAIX, SWPPX).
  if (/^[A-Z]{4}X$/.test(up)) return { assetClass: 'fund', symbol: up };
  return { assetClass: 'equity', symbol: normalizeTicker(up) };
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
