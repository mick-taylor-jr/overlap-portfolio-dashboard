import { describe, expect, it } from 'vitest';
import type { SymbolSearchResult } from '@/lib/types';
import { guessAssetClass, needsFundProfile } from './classify';

const res = (symbol: string, assetClass: SymbolSearchResult['assetClass']): SymbolSearchResult => ({ symbol, name: symbol, assetClass, source: 'yahoo' });

describe('guessAssetClass', () => {
  it('recognizes known funds, mutual-fund patterns, crypto and cash with certainty', () => {
    expect(guessAssetClass('spy')).toMatchObject({ assetClass: 'fund', symbol: 'SPY', certain: true });
    expect(guessAssetClass('VTSAX')).toMatchObject({ assetClass: 'fund', certain: true });
    expect(guessAssetClass('BTC')).toMatchObject({ assetClass: 'crypto', symbol: 'bitcoin', certain: true });
    expect(guessAssetClass('SPAXX')).toMatchObject({ assetClass: 'cash', certain: true });
  });

  it('marks an unrecognized symbol as an uncertain equity (it may be an ETF)', () => {
    expect(guessAssetClass('XBI')).toEqual({ assetClass: 'equity', symbol: 'XBI', certain: false, basis: 'fallback' });
  });

  it("uses a matching search result's assetClass over the heuristics", () => {
    expect(guessAssetClass('xbi', [res('XBI', 'fund')])).toMatchObject({ assetClass: 'fund', symbol: 'XBI', certain: true, basis: 'search' });
    expect(guessAssetClass('BRK.B', [res('BRK-B', 'equity')])).toMatchObject({ assetClass: 'equity', symbol: 'BRK-B', basis: 'search' });
    expect(guessAssetClass('ethereum', [res('ethereum', 'crypto')])).toMatchObject({ assetClass: 'crypto', symbol: 'ethereum' });
  });

  it('ignores search results for other symbols', () => {
    expect(guessAssetClass('XBI', [res('XBIL', 'fund')])).toMatchObject({ assetClass: 'equity', certain: false });
  });
});

describe('needsFundProfile', () => {
  it('probes funds and equities, never synthetic, crypto or cash positions', () => {
    expect(needsFundProfile({ assetClass: 'fund' })).toBe(true);
    expect(needsFundProfile({ assetClass: 'equity' })).toBe(true);
    expect(needsFundProfile({ assetClass: 'equity', synthetic: true })).toBe(false);
    expect(needsFundProfile({ assetClass: 'crypto' })).toBe(false);
    expect(needsFundProfile({ assetClass: 'cash' })).toBe(false);
  });
});
