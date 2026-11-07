import { describe, expect, it } from 'vitest';
import { oneTimeCosts } from '@/lib/finance';

describe('oneTimeCosts', () => {
  it('sums front load, back load and transaction cost per row and in total', () => {
    const r = oneTimeCosts([
      { id: 'a', symbol: 'AGTHX', value: 10_000, frontLoad: 0.0575, backLoad: 0.01, transactionCost: 49.95 },
      { id: 'b', symbol: 'VTI', value: 5_000, transactionCost: 5 },
    ]);
    expect(r.rows[0].frontLoad).toBeCloseTo(575, 8);
    expect(r.rows[0].backLoad).toBeCloseTo(100, 8);
    expect(r.rows[0].transactionCost).toBe(49.95);
    expect(r.rows[0].total).toBeCloseTo(724.95, 8);
    expect(r.rows[1].total).toBe(5);
    expect(r.total).toBeCloseTo(729.95, 8);
    expect(r.unknown).toEqual([]);
    expect(r.hasAny).toBe(true);
  });

  it('rows with nothing entered cost 0 and are not flagged', () => {
    const r = oneTimeCosts([{ id: 'a', symbol: 'VTI', value: null }]);
    expect(r.rows[0]).toMatchObject({ frontLoad: 0, backLoad: 0, transactionCost: 0, total: 0, hasAny: false });
    expect(r.total).toBe(0);
    expect(r.unknown).toEqual([]);
    expect(r.hasAny).toBe(false);
  });

  it('a load on an unknown value is null, never 0, and is excluded from the total', () => {
    const r = oneTimeCosts([
      { id: 'a', symbol: 'AGTHX', value: null, frontLoad: 0.05, transactionCost: 10 },
      { id: 'b', symbol: 'VTI', value: 1_000, backLoad: 0.01 },
    ]);
    expect(r.rows[0].frontLoad).toBeNull();
    expect(r.rows[0].backLoad).toBe(0);
    expect(r.rows[0].transactionCost).toBe(10);
    expect(r.rows[0].total).toBeNull();
    expect(r.unknown).toEqual(['a']);
    expect(r.total).toBeCloseTo(10, 8);
  });

  it('transaction cost alone is known without a value', () => {
    const r = oneTimeCosts([{ id: 'a', symbol: 'X', value: null, transactionCost: 7 }]);
    expect(r.rows[0].total).toBe(7);
    expect(r.unknown).toEqual([]);
  });

  it('zero rates are explicit zeros', () => {
    const r = oneTimeCosts([{ id: 'a', symbol: 'X', value: 1000, frontLoad: 0, backLoad: 0, transactionCost: 0 }]);
    expect(r.rows[0].total).toBe(0);
    expect(r.hasAny).toBe(true);
  });

  it('rejects negative or non-finite inputs', () => {
    expect(() => oneTimeCosts([{ id: 'a', symbol: 'X', value: 1000, frontLoad: -0.01 }])).toThrow(RangeError);
    expect(() => oneTimeCosts([{ id: 'a', symbol: 'X', value: 1000, transactionCost: -1 }])).toThrow(RangeError);
    expect(() => oneTimeCosts([{ id: 'a', symbol: 'X', value: Number.NaN }])).toThrow(RangeError);
  });

  it('empty input', () => {
    expect(oneTimeCosts([])).toEqual({ rows: [], total: 0, unknown: [], hasAny: false });
  });
});
