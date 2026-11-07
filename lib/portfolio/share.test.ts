import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import { describe, expect, it } from 'vitest';
import type { Portfolio, Position } from '@/lib/types';
import { decodeShareHash, encodePortfolioShare, encodeShareHash } from './share';
import { SHARE_NOTIONAL } from './state';

const FORBIDDEN = ['value', 'quantity', 'costBasis', 'transactionCost'];

function payloadOf(hash: string): unknown {
  return JSON.parse(decompressFromEncodedURIComponent(hash.slice('#p='.length)) ?? 'null');
}

function allKeys(x: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(x)) x.forEach((v) => allKeys(v, out));
  else if (x && typeof x === 'object') {
    for (const [k, v] of Object.entries(x)) {
      out.add(k);
      allKeys(v, out);
    }
  }
  return out;
}

function decoded(hash: string): Portfolio {
  const r = decodeShareHash(hash);
  if ('error' in r) throw new Error(r.error);
  return r.portfolio;
}

const starter: Portfolio = {
  name: 'Starter pack',
  advisoryFee: {
    kind: 'tiered',
    brackets: [
      { upTo: 1_000_000, rate: 0.01 },
      { upTo: null, rate: 0.0075 },
    ],
  },
  positions: [
    {
      id: 'a',
      symbol: 'RHWKX',
      assetClass: 'fund',
      quantity: 123.456,
      costBasis: 9876.54,
      account: 'Roth IRA',
      name: 'RedHawk Growth Fund',
      synthetic: true,
      feeOverrides: { expenseRatio: 0.0085, otherRecurringRate: 0.002, frontLoad: 0.0575, backLoad: 0.01, transactionCost: 49.95 },
    },
    { id: 'b', symbol: 'MUBC', assetClass: 'equity', value: 25_000, costBasis: 10_000, sector: 'Financials', name: 'Miami Bancorp', synthetic: true },
    { id: 'c', symbol: 'VTI', assetClass: 'fund', quantity: 10 },
  ],
};
const values: Record<string, number> = { a: 50_000, b: 25_000, c: 25_000 };
const rows = starter.positions.map((position) => ({ position, value: values[position.id] }));

describe('share links (v2)', () => {
  it('round-trips fees, synthetic flags, descriptive fields and the advisory fee', () => {
    const hash = encodePortfolioShare(starter, rows);
    expect(hash).toBeTruthy();
    const p = decoded(hash!);
    expect(p.name).toBe('Starter pack');
    expect(p.advisoryFee).toEqual(starter.advisoryFee);
    const bySym = Object.fromEntries(p.positions.map((x) => [x.symbol, x]));
    expect(bySym.RHWKX).toMatchObject({
      assetClass: 'fund',
      synthetic: true,
      name: 'RedHawk Growth Fund',
      account: 'Roth IRA',
      feeOverrides: { expenseRatio: 0.0085, otherRecurringRate: 0.002, frontLoad: 0.0575, backLoad: 0.01 },
      value: SHARE_NOTIONAL * 0.5,
    });
    expect(bySym.RHWKX.feeOverrides).not.toHaveProperty('transactionCost');
    expect(bySym.MUBC).toMatchObject({ assetClass: 'equity', synthetic: true, sector: 'Financials', name: 'Miami Bancorp', value: SHARE_NOTIONAL * 0.25 });
    expect(bySym.VTI).toEqual({ id: expect.any(String), symbol: 'VTI', assetClass: 'fund', value: SHARE_NOTIONAL * 0.25 });
    for (const x of p.positions as Position[]) {
      expect(x.quantity).toBeUndefined();
      expect(x.costBasis).toBeUndefined();
    }
  });

  it('a flat advisory fee survives', () => {
    const hash = encodeShareHash('x', [{ symbol: 'SPY', assetClass: 'fund', value: 1 }], { advisoryFee: { kind: 'flat', rate: 0.01 } });
    expect(decoded(hash!).advisoryFee).toEqual({ kind: 'flat', rate: 0.01 });
  });

  it('the encoded payload contains no value, quantity, costBasis or transactionCost keys or amounts', () => {
    const hash = encodePortfolioShare(starter, rows)!;
    const payload = payloadOf(hash);
    const keys = allKeys(payload);
    for (const k of FORBIDDEN) expect(keys.has(k)).toBe(false);
    const text = JSON.stringify(payload);
    // Dollar bracket thresholds (1000000) are allowed; holdings amounts are not.
    const numbers = new Set((text.match(/-?\d+(\.\d+)?/g) ?? []).map(Number));
    for (const secret of [123.456, 9876.54, 49.95, 50_000, 25_000, 10_000, 10]) expect(numbers.has(secret)).toBe(false);
  });

  it('ignores extra (non-whitelisted) fields passed in by callers', () => {
    const sneaky = { symbol: 'AAPL', assetClass: 'equity' as const, value: 1000, quantity: 7, costBasis: 500, feeOverrides: { transactionCost: 10 } };
    const keys = allKeys(payloadOf(encodeShareHash('x', [sneaky])!));
    for (const k of FORBIDDEN) expect(keys.has(k)).toBe(false);
  });

  it('keeps positions in different accounts separate and merges identical ones', () => {
    const hash = encodeShareHash('x', [
      { symbol: 'VTI', assetClass: 'fund', value: 10, account: 'IRA' },
      { symbol: 'VTI', assetClass: 'fund', value: 30, account: 'Taxable' },
      { symbol: 'VTI', assetClass: 'fund', value: 60, account: 'Taxable' },
    ])!;
    const p = decoded(hash);
    expect(p.positions.map((x) => [x.account, x.value])).toEqual([
      ['IRA', SHARE_NOTIONAL * 0.1],
      ['Taxable', SHARE_NOTIONAL * 0.9],
    ]);
  });

  it('omits an invalid advisory fee instead of failing', () => {
    const hash = encodeShareHash('x', [{ symbol: 'SPY', assetClass: 'fund', value: 1 }], { advisoryFee: { kind: 'flat', rate: 5 } });
    expect(decoded(hash!).advisoryFee).toBeUndefined();
  });

  it('returns null when nothing has a value', () => {
    expect(encodeShareHash('x', [{ symbol: 'SPY', assetClass: 'fund', value: 0 }])).toBeNull();
  });
});

describe('share links: backward compatibility and errors', () => {
  it('still decodes v1 links', () => {
    const v1 = { v: 1, n: 'Old link', p: [['SPY', 'fund', 0.75], ['AAPL', 'equity', 0.25]] };
    const p = decoded('#p=' + compressToEncodedURIComponent(JSON.stringify(v1)));
    expect(p.name).toBe('Old link');
    expect(p.advisoryFee).toBeUndefined();
    expect(p.positions.map(({ symbol, assetClass, value }) => ({ symbol, assetClass, value }))).toEqual([
      { symbol: 'SPY', assetClass: 'fund', value: SHARE_NOTIONAL * 0.75 },
      { symbol: 'AAPL', assetClass: 'equity', value: SHARE_NOTIONAL * 0.25 },
    ]);
  });

  it('rejects unknown versions and damaged links', () => {
    const v9 = { v: 9, p: [] };
    expect(decodeShareHash('#p=' + compressToEncodedURIComponent(JSON.stringify(v9)))).toHaveProperty('error');
    expect(decodeShareHash('#p=%%%')).toHaveProperty('error');
    expect(decodeShareHash('#nope')).toHaveProperty('error');
  });

  it('rejects out-of-range fee rates in a v2 link', () => {
    const bad = { v: 2, p: [{ s: 'SPY', c: 'fund', w: 1, f: { er: 2 } }] };
    expect(decodeShareHash('#p=' + compressToEncodedURIComponent(JSON.stringify(bad)))).toHaveProperty('error');
  });
});
