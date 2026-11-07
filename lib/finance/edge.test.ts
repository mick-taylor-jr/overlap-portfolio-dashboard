import { describe, expect, it } from 'vitest';
import {
  advisoryFeeAmount,
  assetClassExposure,
  compareSchedules,
  concentration,
  effectiveRate,
  feeDrag,
  flags,
  fv,
  lookThrough,
  lumpSumRatio,
  overlap,
  overlapMatrix,
  portfolioFees,
  sectorExposure,
  sensitivityGrid,
  tieredFee,
  type LookThroughInput,
} from '@/lib/finance';
import { DEFAULT_THRESHOLDS, UNRESOLVED } from '@/lib/types';

const stock = (symbol: string, value: number | null, sector?: string): LookThroughInput => ({
  symbol,
  value,
  holdings: [{ symbol, name: symbol, weight: 1 }],
  coverage: 1,
  assetClass: 'equity',
  sectorWeights: sector ? { [sector]: 1 } : undefined,
});

describe('fv / feeDrag', () => {
  it('handles g = 0, negative g and T = 0', () => {
    expect(fv(1000, 100, 0, 5)).toBe(1500);
    expect(fv(1000, 100, 0.05, 0)).toBe(1000);
    // negative g: 1000*0.9^2 + 100*(0.9 + 1) = 810 + 190
    expect(fv(1000, 100, -0.1, 2)).toBeCloseTo(1000, 8);
    expect(fv(1000, 0, -1, 3)).toBe(0);
    // near-zero g is continuous with the g = 0 branch
    expect(fv(1000, 100, 1e-12, 30)).toBeCloseTo(4000, 6);
  });

  it('rejects invalid inputs with RangeError', () => {
    expect(() => fv(NaN, 0, 0.05, 10)).toThrow(RangeError);
    expect(() => fv(100, 0, NaN, 10)).toThrow(RangeError);
    expect(() => fv(100, 0, 0.05, -1)).toThrow(RangeError);
    expect(() => fv(100, 0, 0.05, 2.5)).toThrow(RangeError);
    expect(() => fv(-1, 0, 0.05, 2)).toThrow(RangeError);
    expect(() => fv(1, Infinity, 0.05, 2)).toThrow(RangeError);
    expect(() => feeDrag({ P: 1, C: 0, r: 0.05, e: -0.01, T: 1 })).toThrow(RangeError);
    expect(() => lumpSumRatio(0.05, 0.01, 1.05, 3)).toThrow(RangeError);
  });

  it('dragPctOfGross is null when gross FV is 0', () => {
    expect(feeDrag({ P: 0, C: 0, r: 0.07, e: 0.01, T: 10 }).dragPctOfGross).toBeNull();
  });

  it('sensitivityGrid covers returns x horizons, returns outer', () => {
    const g = sensitivityGrid({ P: 100_000, C: 0, e: 0.005 }, [0, 0.03, 0.07], [10, 20, 30]);
    expect(g).toHaveLength(9);
    expect(g.map((x) => [x.r, x.T])[3]).toEqual([0.03, 10]);
    expect(g[8].result.drag).toBeCloseTo(99_788.89, 2);
  });
});

describe('advisory fees', () => {
  const brackets = [
    { upTo: 1_000_000, rate: 0.01 },
    { upTo: 3_000_000, rate: 0.0075 },
    { upTo: null, rate: 0.005 },
  ];
  it('flat, tiered, undefined, and AUM 0', () => {
    expect(advisoryFeeAmount(500_000, { kind: 'flat', rate: 0.01 })).toBe(5000);
    expect(advisoryFeeAmount(500_000, undefined)).toBe(0);
    expect(effectiveRate(0, { kind: 'tiered', brackets })).toBe(0.01);
    expect(effectiveRate(500_000, { kind: 'tiered', brackets })).toBeCloseTo(0.01, 10);
    expect(tieredFee(0, brackets)).toBe(0);
    expect(tieredFee(1_000_000, brackets)).toBeCloseTo(10_000, 6);
  });
  it('validates brackets', () => {
    expect(() => tieredFee(1, [])).toThrow(RangeError);
    expect(() => tieredFee(1, [{ upTo: 2, rate: 0.01 }, { upTo: 1, rate: 0.01 }])).toThrow(RangeError);
    expect(() => tieredFee(1, [{ upTo: null, rate: 0.01 }, { upTo: 5, rate: 0.01 }])).toThrow(RangeError);
    expect(() => tieredFee(1, [{ upTo: 5, rate: NaN }])).toThrow(RangeError);
    expect(() => tieredFee(-1, brackets)).toThrow(RangeError);
  });
});

describe('look-through edge cases', () => {
  it('empty portfolio', () => {
    const lt = lookThrough([]);
    expect(lt).toEqual({ totalValue: 0, exposures: [], coveredFraction: 0, excluded: [] });
    const m = concentration(lt, 0);
    expect(m).toMatchObject({ hhi: 0, effectiveN: 0, top1: 0, distinctCount: 0, naiveCount: 0 });
  });

  it('all-null values are excluded and reported', () => {
    const lt = lookThrough([stock('AAPL', null), stock('MSFT', null)]);
    expect(lt.totalValue).toBe(0);
    expect(lt.exposures).toEqual([]);
    expect(lt.excluded).toEqual(['AAPL', 'MSFT']);
  });

  it('partial coverage produces one Unresolved row, last, with per-fund contributions', () => {
    const lt = lookThrough([
      { symbol: 'QQQ', value: 50, holdings: [{ symbol: 'AAPL', name: 'Apple', weight: 0.1 }], coverage: 0.1, assetClass: 'fund' },
      { symbol: 'SPY', value: 50, holdings: [{ symbol: 'AAPL', name: 'Apple', weight: 0.07 }], coverage: 0.07, assetClass: 'fund' },
      stock('XYZ', null),
    ]);
    expect(lt.exposures.map((e) => e.key)).toEqual(['AAPL', UNRESOLVED]);
    expect(lt.coveredFraction).toBeCloseTo(0.085, 10);
    const un = lt.exposures[1];
    expect(un.weight).toBeCloseTo(0.915, 10);
    expect(un.contributions.map((c) => c.from)).toEqual(['SPY', 'QQQ']);
    expect(lt.excluded).toEqual(['XYZ']);
  });

  it('Unresolved stays last even when it is the largest row', () => {
    const lt = lookThrough([
      { symbol: 'F', value: 1, holdings: [{ symbol: 'A', name: 'A', weight: 0.05 }], coverage: 0.05, assetClass: 'fund' },
    ]);
    expect(lt.exposures.at(-1)?.key).toBe(UNRESOLVED);
    expect(lt.exposures[0].key).toBe('A');
  });

  it('issuer grouping via keyOf merges GOOG + GOOGL; null key -> Unresolved', () => {
    const issuer: Record<string, string> = { GOOG: 'Alphabet', GOOGL: 'Alphabet', AAPL: 'Apple' };
    const comps: LookThroughInput[] = [
      {
        symbol: 'VOO',
        value: 100,
        holdings: [
          { symbol: 'GOOGL', name: 'Alphabet A', weight: 0.4 },
          { symbol: 'GOOG', name: 'Alphabet C', weight: 0.3 },
          { symbol: 'AAPL', name: 'Apple', weight: 0.2 },
          { symbol: '???', name: 'Mystery', weight: 0.1 },
        ],
        coverage: 1,
        assetClass: 'fund',
      },
    ];
    const byTicker = lookThrough(comps);
    expect(byTicker.exposures.map((e) => e.key)).toEqual(['GOOGL', 'GOOG', 'AAPL', '???']);
    const byIssuer = lookThrough(comps, {
      keyOf: (s) => (issuer[s] ? { key: issuer[s], name: issuer[s] } : null),
    });
    expect(byIssuer.exposures.map((e) => [e.key, Number(e.weight.toFixed(4))])).toEqual([
      ['Alphabet', 0.7],
      ['Apple', 0.2],
      [UNRESOLVED, 0.1],
    ]);
    expect(byIssuer.exposures[0].contributions).toEqual([{ from: 'VOO', weight: expect.closeTo(0.7, 10) }]);
    expect(byIssuer.coveredFraction).toBeCloseTo(0.9, 10);
  });

  it('merges duplicate component symbols (same fund in two accounts)', () => {
    const lt = lookThrough([stock('AAPL', 30), stock('AAPL', 70)]);
    expect(lt.exposures).toEqual([{ key: 'AAPL', name: 'AAPL', weight: 1, contributions: [{ from: 'AAPL', weight: 1 }] }]);
  });

  it('rejects negative values and weights', () => {
    expect(() => lookThrough([stock('A', -5)])).toThrow(RangeError);
    expect(() =>
      lookThrough([{ symbol: 'F', value: 1, holdings: [{ symbol: 'A', name: 'A', weight: -0.1 }], coverage: 0, assetClass: 'fund' }]),
    ).toThrow(RangeError);
  });

  it('sector exposure: remainder and missing sector weights go to Unresolved', () => {
    const res = sectorExposure([
      { ...stock('VOO', 50), sectorWeights: { 'Information Technology': 0.3, Financials: 0.6 } },
      stock('AAPL', 30, 'Information Technology'),
      stock('BTC', 20),
    ]);
    const w = Object.fromEntries(res.exposures.map((e) => [e.key, e.weight]));
    expect(w['Information Technology']).toBeCloseTo(0.45, 10);
    expect(w.Financials).toBeCloseTo(0.3, 10);
    expect(w[UNRESOLVED]).toBeCloseTo(0.25, 10);
    expect(res.exposures.at(-1)?.key).toBe(UNRESOLVED);
  });

  it('asset-class exposure from allocation or assetClass', () => {
    const res = assetClassExposure([
      { ...stock('AOR', 40), assetClass: 'fund', assetAllocation: { stock: 0.6, bond: 0.38, cash: 0.01 } },
      { ...stock('XYZFUND', 10), assetClass: 'fund' },
      stock('AAPL', 30),
      { ...stock('bitcoin', 15), assetClass: 'crypto' },
      { ...stock('USD', 5), assetClass: 'cash' },
    ]);
    const w = Object.fromEntries(res.exposures.map((e) => [e.key, e.weight]));
    expect(w.Stocks).toBeCloseTo(0.24 + 0.3, 10);
    expect(w.Bonds).toBeCloseTo(0.152, 10);
    expect(w.Cash).toBeCloseTo(0.004 + 0.05, 10);
    expect(w.Crypto).toBeCloseTo(0.15, 10);
    expect(w[UNRESOLVED]).toBeCloseTo(0.1 + 0.004, 10);
  });
});

describe('overlap', () => {
  it('lower bound when coverage < 1 and matrix covers i<j pairs', () => {
    const a = { symbol: 'SPY', holdings: [{ symbol: 'AAPL', name: 'Apple', weight: 0.07 }], holdingsCoverage: 0.07 };
    const b = { symbol: 'VOO', holdings: [{ symbol: 'AAPL', name: 'Apple', weight: 0.07 }], holdingsCoverage: 0.07 };
    const c = { symbol: 'BND', holdings: [], holdingsCoverage: 0 };
    expect(overlap(a, b)).toEqual({ overlap: 0.07, lowerBound: true });
    const m = overlapMatrix([a, b, c]);
    expect(m.map((x) => `${x.a}/${x.b}`)).toEqual(['SPY/VOO', 'SPY/BND', 'VOO/BND']);
    expect(m[1].overlap).toBe(0);
    expect(overlap({ holdings: [], holdingsCoverage: 1 - 1e-9 }, { holdings: [], holdingsCoverage: 1 }).lowerBound).toBe(false);
  });
});

describe('flags', () => {
  it('describes breaches without advice and marks lower bounds', () => {
    const lt = lookThrough([
      { symbol: 'QQQ', value: 50, holdings: [{ symbol: 'AAPL', name: 'Apple', weight: 0.1 }, { symbol: 'MSFT', name: 'MS', weight: 0.08 }], coverage: 0.18, assetClass: 'fund' },
      { symbol: 'SPY', value: 30, holdings: [{ symbol: 'AAPL', name: 'Apple', weight: 0.07 }], coverage: 0.07, assetClass: 'fund' },
      stock('AAPL', 20, 'Information Technology'),
    ]);
    // AAPL = .05 + .021 + .2 = .271
    const sectors = sectorExposure([stock('AAPL', 60, 'Information Technology'), stock('JPM', 40, 'Financials')]);
    const cells = [{ a: 'SPY', b: 'VOO', overlap: 0.98, lowerBound: false }, { a: 'QQQ', b: 'SPY', overlap: 0.45, lowerBound: true }];
    const fs = flags(lt, sectors, cells, { ...DEFAULT_THRESHOLDS, pairOverlap: 0.4 });
    expect(fs.map((f) => [f.kind, f.subject])).toEqual([
      ['single-name', 'AAPL'],
      ['single-sector', 'Information Technology'],
      ['single-sector', 'Financials'],
      ['pair-overlap', 'SPY / VOO'],
      ['pair-overlap', 'QQQ / SPY'],
    ]);
    expect(fs[0].message).toBe('AAPL is at least 27.1% of your portfolio across 3 positions; your threshold is 10%.');
    expect(fs[0].lowerBound).toBe(true);
    expect(fs[1].message).toBe('Information Technology is 60% of your portfolio; your threshold is 35%.');
    expect(fs[1].lowerBound).toBe(false);
    expect(fs[4].message).toBe('QQQ and SPY share at least 45% of their holdings by weight; your threshold is 40%.');
    for (const f of fs) expect(f.message).not.toMatch(/should|recommend|sell|buy/i);
  });

  it('adds precision when rounding would equal the threshold; no flag at exactly threshold', () => {
    const lt = lookThrough([stock('A', 10.04), stock('B', 89.96)]);
    const fs = flags(lt, sectorExposure([]), [], { singleName: 0.1, singleSector: 1, pairOverlap: 1 });
    expect(fs.find((f) => f.subject === 'A')?.message).toBe('A is 10.04% of your portfolio held directly; your threshold is 10%.');
    const exact = flags(lookThrough([stock('A', 10), stock('B', 90)]), sectorExposure([]), [], { singleName: 0.9, singleSector: 1, pairOverlap: 1 });
    expect(exact).toEqual([]);
  });
});

describe('portfolioFees', () => {
  it('excludes unknown expense ratios (never 0) and applies marginal advisory', () => {
    const res = portfolioFees(
      [
        { symbol: 'VOO', value: 600_000, expenseRatio: 0.0003 },
        { symbol: 'ARKK', value: 400_000, expenseRatio: 0.0075, otherRecurringRate: 0.001 },
        { symbol: 'MYST', value: 1_000_000, expenseRatio: null },
        { symbol: 'NOVAL', value: null, expenseRatio: 0.001 },
      ],
      { kind: 'tiered', brackets: [{ upTo: 1_000_000, rate: 0.01 }, { upTo: null, rate: 0.005 }] },
    );
    expect(res.rows[0].annualFee).toBeCloseTo(180, 6);
    expect(res.rows[1].annualFee).toBeCloseTo(3400, 6);
    expect(res.rows[1].totalRate).toBeCloseTo(0.0085, 10);
    expect(res.rows[2]).toMatchObject({ annualFee: null, totalRate: null });
    expect(res.rows[3].annualFee).toBeNull();
    expect(res.unknown).toEqual(['MYST']);
    expect(res.fundFees).toBeCloseTo(3580, 6);
    expect(res.weightedExpenseRatio).toBeCloseTo((180 + 3000) / 1_000_000, 10);
    expect(res.advisoryFee).toBeCloseTo(15_000, 6);
    expect(res.totalAnnualFee).toBeCloseTo(18_580, 6);
    expect(res.allInRate).toBeCloseTo(18_580 / 2_000_000, 10);
    expect(res.knownFraction).toBeCloseTo(0.5, 10);
  });

  it('empty and all-unknown portfolios', () => {
    expect(portfolioFees([])).toMatchObject({ fundFees: 0, advisoryFee: 0, weightedExpenseRatio: null, allInRate: null, knownFraction: 0 });
    const r = portfolioFees([{ symbol: 'X', value: 100, expenseRatio: null }]);
    expect(r.weightedExpenseRatio).toBeNull();
    expect(r.knownFraction).toBe(0);
    expect(() => portfolioFees([{ symbol: 'X', value: 100, expenseRatio: -0.01 }])).toThrow(RangeError);
  });
});

describe('compareSchedules', () => {
  it('tiered advisory charges less as the balance crosses brackets; cumulative fees tracked', () => {
    const pts = compareSchedules(
      [
        { id: 'adv', name: 'Advisor', fundRate: 0.002, advisory: { kind: 'tiered', brackets: [{ upTo: 1_000_000, rate: 0.01 }, { upTo: null, rate: 0.005 }] } },
        { id: 'diy', name: 'DIY', fundRate: 0.0005 },
      ],
      { P: 900_000, C: 0, returns: [0, 0.07], horizons: [0, 1, 10] },
    );
    expect(pts.map((p) => [p.r, p.T])).toEqual([[0, 0], [0, 1], [0, 10], [0.07, 0], [0.07, 1], [0.07, 10]]);
    expect(pts[0].ending).toEqual({ adv: 900_000, diy: 900_000 });
    expect(pts[0].cumulativeFees).toEqual({ adv: 0, diy: 0 });
    expect(pts[1].cumulativeFees.adv).toBeCloseTo(900_000 * 0.012, 6);
    expect(pts[1].ending.adv).toBeCloseTo(900_000 * (1 - 0.012), 6);
    expect(pts[5].ending.adv).toBeLessThan(pts[5].ending.diy);
  });
  it('rejects bad inputs', () => {
    expect(() => compareSchedules([], { P: 1, C: 0, returns: [NaN], horizons: [1] })).toThrow(RangeError);
    expect(() => compareSchedules([], { P: 1, C: 0, returns: [0], horizons: [1.5] })).toThrow(RangeError);
    const s = { id: 'x', name: 'x', fundRate: 0 };
    expect(() => compareSchedules([s, s], { P: 1, C: 0, returns: [0], horizons: [1] })).toThrow(RangeError);
  });
});

import { assetClassExposure as _ace } from './lookthrough';
import { describe as _d, it as _it, expect as _e } from 'vitest';
_d('asset class: crypto allocation key', () => {
  _it('maps a spot crypto ETF allocation {crypto: 1} to Crypto, not Other', () => {
    const r = _ace([
      { symbol: 'IBIT', value: 100, holdings: [{ symbol: 'bitcoin', name: 'Bitcoin', weight: 1 }], coverage: 1, assetClass: 'fund', assetAllocation: { stock: 0, bond: 0, cash: 0, other: 0, crypto: 1 } },
    ]);
    _e(r.exposures.find((x) => x.key === 'Crypto')?.weight).toBeCloseTo(1, 10);
    _e(r.exposures.find((x) => x.key === 'Other')).toBeUndefined();
  });
});
