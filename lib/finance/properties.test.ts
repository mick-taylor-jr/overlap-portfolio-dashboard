import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  compareSchedules,
  feeDrag,
  fv,
  lookThrough,
  overlap,
  sectorExposure,
  assetClassExposure,
  tieredFee,
  type LookThroughInput,
} from '@/lib/finance';
import { UNRESOLVED } from '@/lib/types';

const SYMBOLS = ['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'GOOG', 'AMZN', 'META', 'BRK.B', 'JPM', 'XOM'];
const SECTORS = ['Information Technology', 'Health Care', 'Financials', 'Energy'];

/** Holdings over a small symbol universe whose weights sum to <= 1. */
const holdingsArb = fc
  .array(
    fc.record({ symbol: fc.constantFrom(...SYMBOLS), raw: fc.double({ min: 0, max: 1, noNaN: true }) }),
    { maxLength: 8 },
  )
  .chain((hs) =>
    fc.double({ min: 0, max: 1, noNaN: true }).map((coverageTarget) => {
      const total = hs.reduce((s, h) => s + h.raw, 0);
      const holdings = hs.map((h) => ({
        symbol: h.symbol,
        name: h.symbol,
        weight: total > 0 ? (h.raw / total) * coverageTarget : 0,
      }));
      const coverage = holdings.reduce((s, h) => s + h.weight, 0);
      return { holdings, holdingsCoverage: coverage };
    }),
  );

const componentArb: fc.Arbitrary<LookThroughInput> = fc
  .record({
    symbol: fc.constantFrom('SPY', 'VOO', 'QQQ', 'VTI', 'AAPL', 'BTC'),
    value: fc.option(fc.double({ min: 0, max: 1e7, noNaN: true }), { nil: null, freq: 5 }),
    fund: holdingsArb,
    sectors: fc.option(fc.dictionary(fc.constantFrom(...SECTORS), fc.double({ min: 0, max: 0.25, noNaN: true }))),
    assetClass: fc.constantFrom('equity', 'fund', 'crypto', 'cash'),
    alloc: fc.option(
      fc.record({ stock: fc.double({ min: 0, max: 0.5, noNaN: true }), bond: fc.double({ min: 0, max: 0.5, noNaN: true }) }),
    ),
  })
  .map((r) => ({
    symbol: r.symbol,
    value: r.value,
    holdings: r.fund.holdings,
    coverage: r.fund.holdingsCoverage,
    sectorWeights: r.sectors ?? undefined,
    assetClass: r.assetClass,
    assetAllocation: r.alloc ?? undefined,
  }));

const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

describe('property tests', () => {
  it('look-through exposures sum to coveredFraction, plus unresolved = 1', () => {
    fc.assert(
      fc.property(fc.array(componentArb, { maxLength: 6 }), (comps) => {
        for (const res of [lookThrough(comps), sectorExposure(comps), assetClassExposure(comps)]) {
          const resolved = res.exposures.filter((e) => e.key !== UNRESOLVED);
          const unresolved = res.exposures.filter((e) => e.key === UNRESOLVED);
          expect(unresolved.length).toBeLessThanOrEqual(1);
          if (unresolved.length) expect(res.exposures.at(-1)?.key).toBe(UNRESOLVED);
          expect(sum(resolved.map((e) => e.weight))).toBeCloseTo(res.coveredFraction, 9);
          // each row's weight equals the sum of its contributions
          for (const e of res.exposures) expect(sum(e.contributions.map((c) => c.weight))).toBeCloseTo(e.weight, 9);
          const total = sum(res.exposures.map((e) => e.weight));
          if (res.totalValue > 0) expect(total).toBeCloseTo(1, 9);
          else expect(total).toBe(0);
          expect(res.excluded.length).toBe(comps.filter((c) => c.value === null).length);
          // sorted descending among resolved rows
          for (let i = 1; i < resolved.length; i++) expect(resolved[i - 1].weight).toBeGreaterThanOrEqual(resolved[i].weight);
        }
      }),
    );
  });

  it('overlap is symmetric and in [0, 1]', () => {
    fc.assert(
      fc.property(holdingsArb, holdingsArb, (a, b) => {
        const ab = overlap(a, b);
        const ba = overlap(b, a);
        expect(ab.overlap).toBeCloseTo(ba.overlap, 12);
        expect(ab.lowerBound).toBe(ba.lowerBound);
        expect(ab.overlap).toBeGreaterThanOrEqual(0);
        expect(ab.overlap).toBeLessThanOrEqual(1);
      }),
    );
  });

  it('overlap(A, A) equals coverage', () => {
    fc.assert(
      fc.property(holdingsArb, (a) => {
        expect(overlap(a, a).overlap).toBeCloseTo(a.holdingsCoverage, 12);
      }),
    );
  });

  const dragBase = fc.record({
    P: fc.double({ min: 0, max: 1e7, noNaN: true }),
    C: fc.double({ min: 0, max: 1e5, noNaN: true }),
    r: fc.double({ min: -0.5, max: 0.2, noNaN: true }),
    T: fc.integer({ min: 0, max: 60 }),
  });

  it('fee drag is monotonic in e', () => {
    fc.assert(
      fc.property(
        dragBase,
        fc.double({ min: 0, max: 0.05, noNaN: true }),
        fc.double({ min: 0, max: 0.05, noNaN: true }),
        (b, x, y) => {
          const [lo, hi] = x <= y ? [x, y] : [y, x];
          const dLo = feeDrag({ ...b, e: lo }).drag;
          const dHi = feeDrag({ ...b, e: hi }).drag;
          expect(dHi).toBeGreaterThanOrEqual(dLo - 1e-6 * Math.max(1, Math.abs(dLo)));
        },
      ),
    );
  });

  it('zero fee yields zero drag', () => {
    fc.assert(
      fc.property(dragBase, (b) => {
        const res = feeDrag({ ...b, e: 0 });
        expect(res.drag).toBe(0);
        expect(res.netPath).toEqual(res.grossPath);
      }),
    );
  });

  it('tiered fee is continuous at bracket boundaries', () => {
    const bracketsArb = fc
      .tuple(
        fc.uniqueArray(fc.integer({ min: 1, max: 10_000_000 }), { minLength: 1, maxLength: 4 }),
        fc.array(fc.double({ min: 0, max: 0.02, noNaN: true }), { minLength: 5, maxLength: 5 }),
      )
      .map(([ups, rates]) => {
        const sorted = [...ups].sort((a, b) => a - b);
        return [
          ...sorted.map((u, i) => ({ upTo: u as number | null, rate: rates[i] })),
          { upTo: null, rate: rates[4] },
        ];
      });
    fc.assert(
      fc.property(bracketsArb, (brackets) => {
        const maxRate = Math.max(...brackets.map((b) => b.rate));
        for (const b of brackets) {
          if (b.upTo === null) continue;
          const at = tieredFee(b.upTo, brackets);
          const delta = 0.01;
          const below = tieredFee(b.upTo - delta, brackets);
          const above = tieredFee(b.upTo + delta, brackets);
          expect(Math.abs(at - below)).toBeLessThanOrEqual(maxRate * delta + 1e-9);
          expect(Math.abs(above - at)).toBeLessThanOrEqual(maxRate * delta + 1e-9);
          expect(above).toBeGreaterThanOrEqual(below);
        }
      }),
    );
  });

  it('compareSchedules with flat rates equals fv(P, C, r − e, T)', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 1e6, noNaN: true }),
        fc.double({ min: 0, max: 5e4, noNaN: true }),
        fc.double({ min: -0.3, max: 0.15, noNaN: true }),
        fc.integer({ min: 0, max: 50 }),
        fc.double({ min: 0, max: 0.01, noNaN: true }),
        fc.double({ min: 0, max: 0.01, noNaN: true }),
        fc.double({ min: 0, max: 0.015, noNaN: true }),
        (P, C, r, T, fundRate, other, adv) => {
          const [pt] = compareSchedules(
            [{ id: 's', name: 's', fundRate, otherRecurringRate: other, advisory: { kind: 'flat', rate: adv } }],
            { P, C, returns: [r], horizons: [T] },
          );
          const expected = fv(P, C, r - (fundRate + other + adv), T);
          expect(Math.abs(pt.ending.s - expected)).toBeLessThanOrEqual(1e-9 * Math.max(1, Math.abs(expected)));
        },
      ),
    );
  });
});
