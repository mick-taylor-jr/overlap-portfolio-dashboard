import { describe, expect, it } from 'vitest';
import {
  compareSchedules,
  concentration,
  effectiveRate,
  feeDrag,
  finance,
  fv,
  lookThrough,
  lumpSumRatio,
  overlap,
  tieredFee,
  type LookThroughInput,
} from '@/lib/finance';
import { UNRESOLVED } from '@/lib/types';

describe('required test vectors (spec 5)', () => {
  it('fee drag, lump sum', () => {
    const r = feeDrag({ P: 100_000, C: 0, r: 0.07, e: 0.005, T: 30 });
    expect(r.grossFV).toBeCloseTo(761_225.5, 2);
    expect(r.netFV).toBeCloseTo(661_436.62, 2);
    expect(r.drag).toBeCloseTo(99_788.89, 2);
    expect(r.dragPctOfGross).toBeCloseTo(0.1311, 4);
    expect(r.grossPath).toHaveLength(31);
    expect(r.grossPath[0]).toBe(100_000);
    expect(r.grossPath[30]).toBeCloseTo(r.grossFV, 2);
    expect(r.netPath[30]).toBeCloseTo(r.netFV, 2);
  });

  it('fee drag, contributions', () => {
    const r = feeDrag({ P: 100_000, C: 10_000, r: 0.07, e: 0.005, T: 30 });
    expect(r.grossFV).toBeCloseTo(1_705_833.37, 2);
    expect(r.netFV).toBeCloseTo(1_525_185.26, 2);
    expect(r.drag).toBeCloseTo(180_648.11, 2);
    expect(r.dragPctOfGross).toBeCloseTo(0.1059, 4);
    expect(r.netPath[30]).toBeCloseTo(r.netFV, 2);
  });

  it('schedule comparison', () => {
    const [pt] = compareSchedules(
      [
        { id: 'a', name: 'Low', fundRate: 0.001 },
        { id: 'b', name: 'High', fundRate: 0.01 },
      ],
      { P: 100_000, C: 0, returns: [0.07], horizons: [30] },
    );
    expect(pt.ending.a).toBeCloseTo(740_169.45, 2);
    expect(pt.ending.b).toBeCloseTo(574_349.12, 2);
    expect(pt.ending.a - pt.ending.b).toBeCloseTo(165_820.33, 2);
    expect(pt.ending.b / pt.ending.a).toBeCloseTo(0.776, 3);
    expect(lumpSumRatio(0.07, 0.01, 0.001, 30)).toBeCloseTo(pt.ending.b / pt.ending.a, 10);
  });

  it('zero net return branch', () => {
    expect(fv(0, 10_000, 0, 30)).toBe(300_000);
  });

  it('tiered fee (marginal brackets)', () => {
    const brackets = [
      { upTo: 1_000_000, rate: 0.01 },
      { upTo: 3_000_000, rate: 0.0075 },
      { upTo: null, rate: 0.005 },
    ];
    expect(tieredFee(2_500_000, brackets)).toBeCloseTo(21_250, 2);
    expect(effectiveRate(2_500_000, { kind: 'tiered', brackets })).toBeCloseTo(0.0085, 4);
    // above the top finite bracket
    expect(tieredFee(4_000_000, brackets)).toBeCloseTo(10_000 + 15_000 + 5_000, 2);
  });

  it('look-through, HHI, effective N, overlap', () => {
    const A = {
      holdings: [
        { symbol: 'AAPL', name: 'Apple', weight: 0.5 },
        { symbol: 'MSFT', name: 'Microsoft', weight: 0.3 },
        { symbol: 'NVDA', name: 'NVIDIA', weight: 0.2 },
      ],
      holdingsCoverage: 1,
    };
    const B = {
      holdings: [
        { symbol: 'AAPL', name: 'Apple', weight: 0.25 },
        { symbol: 'MSFT', name: 'Microsoft', weight: 0.25 },
        { symbol: 'GOOGL', name: 'Alphabet', weight: 0.5 },
      ],
      holdingsCoverage: 1,
    };
    const comps: LookThroughInput[] = [
      { symbol: 'A', value: 60_000, holdings: A.holdings, coverage: 1, assetClass: 'fund' },
      { symbol: 'B', value: 40_000, holdings: B.holdings, coverage: 1, assetClass: 'fund' },
    ];
    const lt = lookThrough(comps);
    const w = Object.fromEntries(lt.exposures.map((e) => [e.key, e.weight]));
    expect(w.AAPL).toBeCloseTo(0.4, 4);
    expect(w.MSFT).toBeCloseTo(0.28, 4);
    expect(w.NVDA).toBeCloseTo(0.12, 4);
    expect(w.GOOGL).toBeCloseTo(0.2, 4);
    expect(w[UNRESOLVED]).toBeUndefined();
    expect(lt.coveredFraction).toBeCloseTo(1, 10);
    expect(lt.exposures.map((e) => e.key)).toEqual(['AAPL', 'MSFT', 'GOOGL', 'NVDA']);
    const aapl = lt.exposures[0];
    expect(aapl.contributions).toEqual([
      { from: 'A', weight: expect.closeTo(0.3, 10) },
      { from: 'B', weight: expect.closeTo(0.1, 10) },
    ]);

    const m = concentration(lt, 2);
    expect(m.hhi).toBeCloseTo(0.2928, 4);
    expect(m.effectiveN).toBeCloseTo(3.415, 3);
    expect(m.top1).toBeCloseTo(0.4, 4);
    expect(m.top5).toBeCloseTo(1, 4);
    expect(m.distinctCount).toBe(4);
    expect(m.naiveCount).toBe(2);

    const o = overlap(A, B);
    expect(o.overlap).toBeCloseTo(0.5, 4);
    expect(o.lowerBound).toBe(false);
    expect(finance.overlap(B, A).overlap).toBeCloseTo(0.5, 4);
  });
});
