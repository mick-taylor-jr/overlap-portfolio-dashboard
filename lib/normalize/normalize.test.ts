import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { GICS_SECTORS } from '@/lib/types';
import {
  CRYPTO_ETF_UNDERLYING,
  CRYPTO_TICKER_TO_ID,
  ISSUER_GROUPS,
  SECTOR_LABEL_MAPPINGS,
  cryptoEtfUnderlying,
  cryptoIdForTicker,
  issuerKey,
  mapSectorWeights,
  normalizeTicker,
  toGicsSector,
} from './index';

describe('normalizeTicker', () => {
  it.each([
    ['brk.b', 'BRK-B'],
    ['BRK.B', 'BRK-B'],
    [' brk-b ', 'BRK-B'],
    ['BRK/B', 'BRK-B'],
    ['BRK B', 'BRK-B'],
    ['bf.b', 'BF-B'],
    ['aapl', 'AAPL'],
    ['  MSFT\t', 'MSFT'],
    ['AMS: ASML', 'AMS:ASML'],
    ['TPE:2330', 'TPE:2330'],
    ['UST-4.625-2035-02-15', 'UST-4.625-2035-02-15'],
    ['BRK..B', 'BRK-B'],
    ['.BRK.', 'BRK'],
    ['', ''],
    ['   ', ''],
  ])('%j -> %j', (input, expected) => {
    expect(normalizeTicker(input)).toBe(expected);
  });

  it('is idempotent', () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const once = normalizeTicker(s);
        expect(normalizeTicker(once)).toBe(once);
      }),
    );
  });

  it('never emits lowercase, whitespace, slashes or edge dashes', () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const out = normalizeTicker(s);
        expect(out).toBe(out.toUpperCase());
        expect(out).not.toMatch(/[\s/]|^-|-$/);
      }),
    );
  });
});

describe('issuerKey', () => {
  it('groups Alphabet share classes', () => {
    expect(issuerKey('GOOG')).toEqual({ key: 'ALPHABET', name: 'Alphabet Inc.' });
    expect(issuerKey('googl', 'Alphabet Inc. Class A')).toEqual({ key: 'ALPHABET', name: 'Alphabet Inc.' });
  });
  it('groups Berkshire share classes regardless of punctuation', () => {
    expect(issuerKey('BRK.B').key).toBe('BERKSHIRE-HATHAWAY');
    expect(issuerKey('BRK-A').key).toBe('BERKSHIRE-HATHAWAY');
    expect(issuerKey('brk/b').name).toBe('Berkshire Hathaway Inc.');
  });
  it('groups FOX/FOXA and NWS/NWSA', () => {
    expect(issuerKey('FOX').key).toBe(issuerKey('FOXA').key);
    expect(issuerKey('NWS').key).toBe(issuerKey('NWSA').key);
  });
  it('passes other symbols through', () => {
    expect(issuerKey('aapl', 'Apple Inc.')).toEqual({ key: 'AAPL', name: 'Apple Inc.' });
    expect(issuerKey('MSFT')).toEqual({ key: 'MSFT', name: 'MSFT' });
  });
  it('has no symbol in two groups', () => {
    const all = ISSUER_GROUPS.flatMap((g) => g.symbols);
    expect(new Set(all).size).toBe(all.length);
    for (const s of all) expect(normalizeTicker(s)).toBe(s);
  });
});

describe('crypto tables', () => {
  it('maps spot bitcoin ETFs to bitcoin', () => {
    for (const s of ['IBIT', 'FBTC', 'GBTC', 'BITB', 'ARKB', 'HODL', 'BTCO', 'EZBC']) {
      expect(cryptoEtfUnderlying(s)).toBe('bitcoin');
    }
  });
  it('maps spot ether ETFs to ethereum', () => {
    for (const s of ['ETHA', 'FETH', 'ETHE', 'etha']) expect(cryptoEtfUnderlying(s)).toBe('ethereum');
  });
  it('flags BITO as futures and does not look it through', () => {
    expect(CRYPTO_ETF_UNDERLYING.BITO.kind).toBe('futures');
    expect(cryptoEtfUnderlying('BITO')).toBeNull();
    expect(cryptoEtfUnderlying('SPY')).toBeNull();
  });
  it('resolves tickers to CoinGecko ids', () => {
    expect(cryptoIdForTicker('btc')).toBe('bitcoin');
    expect(cryptoIdForTicker('BTC-USD')).toBe('bitcoin');
    expect(cryptoIdForTicker('USDC')).toBe('usd-coin');
    expect(cryptoIdForTicker('usdt')).toBe('tether');
    expect(cryptoIdForTicker('AVAX')).toBe('avalanche-2');
    expect(cryptoIdForTicker('bitcoin')).toBe('bitcoin');
    expect(cryptoIdForTicker('NOPE')).toBeNull();
    expect(cryptoIdForTicker('  ')).toBeNull();
    expect(Object.keys(CRYPTO_TICKER_TO_ID)).toHaveLength(12);
  });
});

describe('toGicsSector', () => {
  it.each([
    ['technology', 'Information Technology'],
    ['healthcare', 'Health Care'],
    ['financial_services', 'Financials'],
    ['consumer_cyclical', 'Consumer Discretionary'],
    ['consumer_defensive', 'Consumer Staples'],
    ['basic_materials', 'Materials'],
    ['communication_services', 'Communication Services'],
    ['realestate', 'Real Estate'],
    ['utilities', 'Utilities'],
    ['energy', 'Energy'],
    ['industrials', 'Industrials'],
    ['INFORMATION TECHNOLOGY', 'Information Technology'],
    ['HEALTH CARE', 'Health Care'],
    ['Technology', 'Information Technology'],
    ['Healthcare', 'Health Care'],
    ['Communication', 'Communication Services'],
    ['Telecommunications', 'Communication Services'],
    ['Basic Materials', 'Materials'],
    ['  real-estate ', 'Real Estate'],
    ['Cash and/or Derivatives', 'Other'],
    ['Crypto', 'Other'],
    ['', 'Other'],
  ])('%j -> %j', (label, expected) => {
    expect(toGicsSector(label)).toBe(expected);
  });

  it('handles null/undefined', () => {
    expect(toGicsSector(null)).toBe('Other');
    expect(toGicsSector(undefined)).toBe('Other');
  });

  it('only maps to the 11 GICS sectors', () => {
    const valid = new Set<string>(GICS_SECTORS);
    for (const m of SECTOR_LABEL_MAPPINGS) expect(valid.has(m.gics)).toBe(true);
    for (const g of GICS_SECTORS) expect(toGicsSector(g)).toBe(g);
  });

  it('mapSectorWeights sums colliding labels and drops invalid weights', () => {
    expect(
      mapSectorWeights({ technology: 0.3, 'Information Technology': 0.1, healthcare: 0.2, weird: 0.05, bad: Number.NaN, neg: -1 }),
    ).toEqual({ 'Information Technology': 0.4, 'Health Care': 0.2, Other: 0.05 });
  });
});
