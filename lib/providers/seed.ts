/** Seed "provider": wraps lib/seed. Always available, always stale:true with asOf = capture date. */
import type { FundProfile, Quote } from '@/lib/types';
import { getSeedCrypto, getSeedProfile, getSeedQuote, listSeedFundSymbols, SEED_CAPTURED_AT } from '@/lib/seed';
import type { CryptoPrice } from './types';

export interface SeedSource {
  capturedAt: string;
  quote(symbol: string): Quote | null;
  profile(symbol: string): FundProfile | null;
  crypto(id: string): CryptoPrice | null;
  fundSymbols(): string[];
}

export const seedSource: SeedSource = {
  capturedAt: SEED_CAPTURED_AT,
  quote: getSeedQuote,
  profile: getSeedProfile,
  crypto: getSeedCrypto,
  fundSymbols: listSeedFundSymbols,
};
