/**
 * Validates the bundled seed dataset so bad data fails CI.
 */
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { cryptoPriceSchema, fundProfileSchema, quoteSchema } from '@/lib/api-contracts';
import { GICS_SECTORS } from '@/lib/types';
import { cryptoEtfUnderlying, normalizeTicker } from '@/lib/normalize';
import { getSeedCrypto, getSeedProfile, getSeedQuote, listSeedFundSymbols } from '@/lib/seed';
import fundProfiles from '@/data/seed/fund-profiles.json';
import quotes from '@/data/seed/quotes.json';
import crypto from '@/data/seed/crypto.json';
import { SAMPLE_PORTFOLIOS } from './index';

const FUNDS = [
  'SPY', 'VOO', 'IVV', 'VTI', 'ITOT', 'SCHB', 'QQQ', 'QQQM', 'VGT', 'XLK', 'SCHD', 'VYM', 'VXUS', 'VEA', 'IEFA',
  'VT', 'AGG', 'BND', 'TLT', 'SCHG', 'VUG', 'VTV', 'RSP', 'XLF', 'XLV', 'ARKK', 'IBIT', 'FBTC', 'GBTC', 'ETHA',
];
const STOCKS = [
  'AAPL', 'MSFT', 'NVDA', 'GOOGL', 'GOOG', 'AMZN', 'META', 'TSLA', 'BRK-B', 'AVGO', 'JPM', 'LLY', 'V', 'UNH', 'XOM',
  'MA', 'COST', 'HD', 'PG', 'JNJ', 'NFLX', 'WMT', 'ORCL', 'AMD', 'KO', 'PEP', 'CRM', 'BAC', 'CVX', 'MRK',
];
const BOND_FUNDS = ['AGG', 'BND', 'TLT'];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

describe('data/seed/fund-profiles.json', () => {
  const file = z
    .object({ capturedAt: z.string().regex(ISO_DATE), profiles: z.array(fundProfileSchema) })
    .parse(fundProfiles);

  it('covers every required fund exactly once', () => {
    const syms = file.profiles.map((p) => p.symbol);
    expect(new Set(syms).size).toBe(syms.length);
    expect([...syms].sort()).toEqual([...FUNDS].sort());
    expect(listSeedFundSymbols().sort()).toEqual([...FUNDS].sort());
  });

  it.each(FUNDS)('%s is internally consistent', (sym) => {
    const p = file.profiles.find((x) => x.symbol === sym)!;
    expect(p.source).toBe('seed');
    expect(p.stale).toBe(true);
    expect(p.name.length).toBeGreaterThan(3);
    // expense ratios are decimals (0.0945% -> 0.000945), never percent
    if (p.expenseRatio !== null) expect(p.expenseRatio).toBeLessThan(0.02);
    const sum = p.holdings.reduce((a, h) => a + h.weight, 0);
    expect(p.holdingsCoverage).toBeCloseTo(Math.min(sum, 1), 5);
    expect(p.holdingsCoverage).toBeLessThanOrEqual(1);
    const underlying = cryptoEtfUnderlying(sym);
    if (underlying) {
      expect(p.holdings).toEqual([{ symbol: underlying, name: expect.any(String), weight: 1 }]);
      expect(p.sectorWeights).toEqual({});
    } else {
      expect(p.holdings.length).toBeGreaterThanOrEqual(BOND_FUNDS.includes(sym) ? 1 : 10);
      for (const h of p.holdings) {
        expect(h.symbol).toBe(normalizeTicker(h.symbol));
        expect(h.weight).toBeGreaterThan(0);
      }
      const hs = p.holdings.map((h) => h.symbol);
      expect(new Set(hs).size).toBe(hs.length);
    }
    const validSectors = new Set<string>([...GICS_SECTORS, 'Other']);
    for (const [k, w] of Object.entries(p.sectorWeights)) {
      expect(validSectors.has(k)).toBe(true);
      expect(w).toBeGreaterThanOrEqual(0);
      expect(w).toBeLessThanOrEqual(1.0001);
    }
    const sectorSum = Object.values(p.sectorWeights).reduce((a, b) => a + b, 0);
    if (sectorSum > 0) expect(sectorSum).toBeLessThanOrEqual(1.002);
    if (BOND_FUNDS.includes(sym)) {
      expect(p.sectorWeights).toEqual({});
      expect(p.assetAllocation?.bond).toBeGreaterThan(0.99);
    }
    if (p.assetAllocation) {
      const a = Object.values(p.assetAllocation).reduce((x, y) => x + y, 0);
      expect(a).toBeCloseTo(1, 3);
    }
  });

  it('loader serves seed provenance', () => {
    const p = getSeedProfile('spy');
    expect(p?.source).toBe('seed');
    expect(p?.asOf).toBe(file.capturedAt);
  });
});

describe('data/seed/quotes.json', () => {
  const file = z.object({ capturedAt: z.string().regex(ISO_DATE), quotes: z.array(quoteSchema) }).parse(quotes);

  it('has a USD seed quote for every fund and common stock', () => {
    const syms = file.quotes.map((q) => q.symbol);
    expect(new Set(syms).size).toBe(syms.length);
    for (const s of [...FUNDS, ...STOCKS]) expect(syms).toContain(s);
    for (const q of file.quotes) {
      expect(q.currency).toBe('USD');
      expect(q.source).toBe('seed');
      expect(q.stale).toBe(true);
      expect(q.asOf).toMatch(ISO_DATE);
      expect(q.symbol).toBe(normalizeTicker(q.symbol));
      expect(q.name).toBeTruthy();
    }
    expect(getSeedQuote('brk.b'.toUpperCase().replace('.', '-'))?.price).toBeGreaterThan(0);
  });
});

describe('data/seed/crypto.json', () => {
  it('validates and includes the majors', () => {
    const file = z
      .object({ capturedAt: z.string().regex(ISO_DATE), prices: z.array(z.object({ id: z.string(), usd: z.number().positive() })) })
      .parse(crypto);
    const ids = file.prices.map((p) => p.id);
    for (const id of ['bitcoin', 'ethereum', 'solana']) expect(ids).toContain(id);
    for (const id of ids) expect(cryptoPriceSchema.parse(getSeedCrypto(id))).toBeTruthy();
  });
});

describe('samples are fully covered by seed data', () => {
  it.each(SAMPLE_PORTFOLIOS.map((s) => [s.id, s] as const))('%s', (_id, s) => {
    for (const p of s.portfolio.positions) {
      if (p.assetClass === 'fund') {
        expect(getSeedProfile(p.symbol), p.symbol).not.toBeNull();
        expect(getSeedQuote(p.symbol), p.symbol).not.toBeNull();
      } else if (p.assetClass === 'equity') expect(getSeedQuote(p.symbol), p.symbol).not.toBeNull();
      else if (p.assetClass === 'crypto') expect(getSeedCrypto(p.symbol), p.symbol).not.toBeNull();
    }
  });
});
