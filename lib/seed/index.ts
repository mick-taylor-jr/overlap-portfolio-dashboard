/**
 * Bundled seed dataset loader. Seed data lets the app work with zero API keys and when every
 * provider is down. Every seed-derived value is marked source 'seed', stale true, and asOf = the
 * capture date, so the UI can show a "Sample data, captured YYYY-MM-DD" badge.
 *
 * Data files (owned by the data/seed work):
 *   data/seed/fund-profiles.json  -> { capturedAt: string, profiles: FundProfile[] }
 *   data/seed/quotes.json         -> { capturedAt: string, quotes: Quote[] }      (stocks/ETFs)
 *   data/seed/crypto.json         -> { capturedAt: string, prices: { id, usd }[] }
 */
import type { FundProfile, Quote } from '@/lib/types';
import fundProfiles from '@/data/seed/fund-profiles.json';
import quotes from '@/data/seed/quotes.json';
import crypto from '@/data/seed/crypto.json';

type SeedProfiles = { capturedAt: string; profiles: FundProfile[] };
type SeedQuotes = { capturedAt: string; quotes: Quote[] };
type SeedCrypto = { capturedAt: string; prices: { id: string; usd: number }[] };

const P = fundProfiles as SeedProfiles;
const Q = quotes as SeedQuotes;
const C = crypto as SeedCrypto;

export const SEED_CAPTURED_AT: string = P.capturedAt;

const profileMap = new Map(P.profiles.map((p) => [p.symbol.toUpperCase(), p]));
const quoteMap = new Map(Q.quotes.map((q) => [q.symbol.toUpperCase(), q]));
const cryptoMap = new Map(C.prices.map((c) => [c.id, c]));

export function getSeedProfile(symbol: string): FundProfile | null {
  const p = profileMap.get(symbol.toUpperCase());
  return p ? { ...p, source: 'seed', stale: true, asOf: P.capturedAt } : null;
}

export function getSeedQuote(symbol: string): Quote | null {
  const q = quoteMap.get(symbol.toUpperCase());
  return q ? { ...q, source: 'seed', stale: true, asOf: Q.capturedAt } : null;
}

export function getSeedCrypto(id: string): { id: string; usd: number; source: string; asOf: string; stale: boolean } | null {
  const c = cryptoMap.get(id);
  return c ? { ...c, source: 'seed', stale: true, asOf: C.capturedAt } : null;
}

export function listSeedFundSymbols(): string[] {
  return [...profileMap.keys()];
}
