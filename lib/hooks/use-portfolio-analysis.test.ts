import { describe, expect, it } from 'vitest';
import type { FundProfile, Position, Quote } from '@/lib/types';
import { buildComponent, buildRow } from './use-portfolio-analysis';

const quote = (symbol: string, price: number): Quote => ({ symbol, price, currency: 'USD', source: 'yahoo', asOf: '2026-11-07', stale: false });
const xbiProfile: FundProfile = {
  symbol: 'XBI',
  name: 'SPDR S&P Biotech ETF',
  expenseRatio: 0.0035,
  holdings: [{ symbol: 'EXEL', name: 'Exelixis', weight: 0.02 }],
  sectorWeights: { 'Health Care': 1 },
  holdingsCoverage: 0.02,
  source: 'yahoo',
  asOf: '2026-11-07',
  stale: false,
};
const equity = (symbol: string): Position => ({ id: symbol, symbol, assetClass: 'equity', quantity: 10 });

function row(p: Position, profiles: Record<string, FundProfile | null>, profilesLoading = false) {
  return buildRow(p, { [p.symbol]: quote(p.symbol, 100) }, profiles, {}, false, profilesLoading, false);
}

describe('buildRow: equities probed for fund profiles', () => {
  it('an equity with a fund profile is analysed as a fund with its real expense ratio', () => {
    const r = row(equity('XBI'), { XBI: xbiProfile });
    expect(r.assetClass).toBe('fund');
    expect(r.classInferred).toBe(true);
    expect(r.expenseRatio).toBe(0.0035);
    expect(r.profile).toBe(xbiProfile);
    const c = buildComponent('fund:XBI', [{ ...r, weight: 1 }]);
    expect(c.assetClass).toBe('fund');
    expect(c.input.holdings).toHaveLength(1);
    expect(c.input.coverage).toBe(0.02);
  });

  it('an equity whose profile is null is a direct stock (0% fund fee)', () => {
    const r = row(equity('AAPL'), { AAPL: null });
    expect(r.assetClass).toBe('equity');
    expect(r.classInferred).toBe(false);
    expect(r.expenseRatio).toBe(0);
    expect(r.expenseSource).toBe('direct');
  });

  it('an equity whose profile check has not answered has an UNKNOWN expense ratio, not 0', () => {
    for (const loading of [true, false]) {
      const r = row(equity('XBI'), {}, loading);
      expect(r.expenseRatio).toBeNull();
      expect(r.expenseSource).toBeNull();
    }
  });

  it('a fund with no profile keeps an unknown expense ratio', () => {
    const r = row({ id: 'f', symbol: 'ZZZZX', assetClass: 'fund', value: 100 }, { ZZZZX: null });
    expect(r.expenseRatio).toBeNull();
  });

  it('a user expense-ratio override still wins', () => {
    const r = row({ ...equity('XBI'), feeOverrides: { expenseRatio: 0.001 } }, {});
    expect(r.expenseRatio).toBe(0.001);
  });

  it('synthetic equities are direct and never wait on a profile', () => {
    const r = row({ id: 's', symbol: 'MUBC', assetClass: 'equity', value: 100, synthetic: true }, {});
    expect(r.expenseRatio).toBe(0);
    expect(r.expenseSource).toBe('direct');
  });
});
