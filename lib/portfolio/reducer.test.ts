import { describe, expect, it } from 'vitest';
import { initialState, reducer, parseState } from '@/lib/portfolio';

const withPos = () => {
  const s = initialState();
  return reducer(s, { type: 'add', positions: [{ id: 'x', symbol: 'AGTHX', assetClass: 'fund', value: 1000, feeOverrides: { expenseRatio: 0.006 } }] });
};

describe('reducer feeOverrides', () => {
  it('merges one-time cost fields without touching other overrides', () => {
    const s = reducer(withPos(), { type: 'feeOverrides', id: 'x', patch: { frontLoad: 0.0575, transactionCost: 20 } });
    expect(s.portfolio.positions[0].feeOverrides).toEqual({ expenseRatio: 0.006, frontLoad: 0.0575, transactionCost: 20 });
  });

  it('undefined deletes a key and an empty object is dropped', () => {
    let s = reducer(withPos(), { type: 'feeOverrides', id: 'x', patch: { backLoad: 0.01 } });
    s = reducer(s, { type: 'feeOverrides', id: 'x', patch: { backLoad: undefined, expenseRatio: undefined } });
    expect(s.portfolio.positions[0]).not.toHaveProperty('feeOverrides');
  });

  it('persisted state with includeOneTime round-trips; older state without it still parses', () => {
    const s = reducer(withPos(), { type: 'feeAssumptions', patch: { includeOneTime: true } });
    expect(parseState(JSON.parse(JSON.stringify(s)))?.feeAssumptions.includeOneTime).toBe(true);
    const old = JSON.parse(JSON.stringify(withPos()));
    expect(parseState(old)?.portfolio.positions).toHaveLength(1);
    expect(parseState(old)?.feeAssumptions.includeOneTime).toBeUndefined();
  });
});
