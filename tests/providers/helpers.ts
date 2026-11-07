import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { FundProfile, Quote } from '@/lib/types';
import type { CryptoPrice } from '@/lib/providers/types';
import type { SeedSource } from '@/lib/providers/seed';

export function fixture(name: string): unknown {
  return JSON.parse(readFileSync(path.join(__dirname, 'fixtures', name), 'utf8')) as unknown;
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

export const noSleep = { sleep: async () => undefined };

export function profile(symbol: string, source: string, extra: Partial<FundProfile> = {}): FundProfile {
  return {
    symbol,
    name: `${symbol} Fund`,
    expenseRatio: 0.0003,
    holdings: [{ symbol: 'AAPL', name: 'Apple', weight: 0.07 }],
    sectorWeights: { 'Information Technology': 0.3 },
    holdingsCoverage: 0.07,
    totalHoldingsCount: null,
    source,
    asOf: '2026-11-06T00:00:00.000Z',
    stale: false,
    ...extra,
  };
}

export function quote(symbol: string, source: string, price = 100): Quote {
  return { symbol, price, currency: 'USD', source, asOf: '2026-11-06T00:00:00.000Z', stale: false };
}

export function fakeSeed(opts: { quotes?: string[]; profiles?: string[]; crypto?: string[] } = {}): SeedSource {
  const capturedAt = '2026-11-01';
  return {
    capturedAt,
    quote: (s) => (opts.quotes?.includes(s.toUpperCase()) ? { ...quote(s.toUpperCase(), 'seed', 1), asOf: capturedAt, stale: true } : null),
    profile: (s) => (opts.profiles?.includes(s.toUpperCase()) ? { ...profile(s.toUpperCase(), 'seed'), asOf: capturedAt, stale: true } : null),
    crypto: (id): CryptoPrice | null => (opts.crypto?.includes(id) ? { id, usd: 1, source: 'seed', asOf: capturedAt, stale: true } : null),
    fundSymbols: () => opts.profiles ?? [],
  };
}
