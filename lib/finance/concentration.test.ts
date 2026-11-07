import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { concentration, lookThrough } from './index';
import type { LookThroughInput } from './contracts';

const fund = (symbol: string, value: number, holdings: [string, number][]): LookThroughInput => ({
  symbol,
  value,
  holdings: holdings.map(([s, w]) => ({ symbol: s, name: s, weight: w })),
  coverage: holdings.reduce((a, [, w]) => a + w, 0),
  assetClass: 'fund',
});

describe('effective N with partial holdings', () => {
  it('does not rise when a fund with no disclosed holdings is added', () => {
    const base = [fund('A', 60, [['AAPL', 0.5], ['MSFT', 0.3], ['NVDA', 0.2]]), fund('B', 40, [['AAPL', 0.25], ['MSFT', 0.25], ['GOOGL', 0.5]])];
    const n1 = concentration(lookThrough(base), 2).effectiveN;
    const n2 = concentration(lookThrough([...base, fund('X', 100, [])]), 3).effectiveN;
    expect(n1).toBeCloseTo(3.415, 3);
    expect(n2).toBeCloseTo(n1, 10);
  });

  it('never exceeds the number of distinct resolved holdings', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            value: fc.double({ min: 1, max: 1e6, noNaN: true }),
            ws: fc.array(fc.double({ min: 0.001, max: 0.2, noNaN: true }), { minLength: 0, maxLength: 5 }),
          }),
          { minLength: 1, maxLength: 4 },
        ),
        (funds) => {
          const comps = funds.map((f, i) => fund(`F${i}`, f.value, f.ws.map((w, j) => [`S${(i + j) % 6}`, w] as [string, number])));
          const m = concentration(lookThrough(comps), comps.length);
          expect(m.effectiveN).toBeLessThanOrEqual(m.distinctCount + 1e-9);
        },
      ),
    );
  });
});
