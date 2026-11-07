/**
 * Pairwise fund overlap (spec 5.2): overlap(A,B) = Σ_i min(h_A,i, h_B,i), in [0, 1].
 * Duplicate symbols within a fund are summed first. If either fund's holdingsCoverage is below
 * 1 (tolerance 1e-6) the value is a LOWER BOUND ("at least X%").
 */
import type { FundProfile } from '@/lib/types';
import type { OverlapCell } from './contracts';
import { EPS, assertFinite, assertNonNegative } from './guards';

type FundLike = Pick<FundProfile, 'holdings' | 'holdingsCoverage'>;

function weightMap(f: FundLike): Map<string, number> {
  assertFinite(f.holdingsCoverage, 'holdingsCoverage');
  const m = new Map<string, number>();
  for (const h of f.holdings) {
    assertNonNegative(h.weight, `holding weight of ${h.symbol}`);
    m.set(h.symbol, (m.get(h.symbol) ?? 0) + h.weight);
  }
  return m;
}

export function overlap(a: FundLike, b: FundLike): { overlap: number; lowerBound: boolean } {
  const ma = weightMap(a);
  const mb = weightMap(b);
  let sum = 0;
  for (const [sym, wa] of ma) {
    const wb = mb.get(sym);
    if (wb !== undefined) sum += Math.min(wa, wb);
  }
  return {
    overlap: Math.min(1, sum),
    lowerBound: a.holdingsCoverage < 1 - EPS || b.holdingsCoverage < 1 - EPS,
  };
}

/** All unordered pairs i < j, in input order. */
export function overlapMatrix(
  funds: { symbol: string; holdings: FundProfile['holdings']; holdingsCoverage: number }[],
): OverlapCell[] {
  const cells: OverlapCell[] = [];
  for (let i = 0; i < funds.length; i++) {
    for (let j = i + 1; j < funds.length; j++) {
      const r = overlap(funds[i], funds[j]);
      cells.push({ a: funds[i].symbol, b: funds[j].symbol, ...r });
    }
  }
  return cells;
}
