/**
 * One-time costs (spec 5.4): front/back-end loads and transaction costs. These are paid ONCE,
 * not every year, so they are kept apart from annual recurring fees and the all-in rate.
 *
 * Conventions:
 *  - Per row: frontLoad × value + backLoad × value + transactionCost (USD).
 *  - A field the user has not entered contributes nothing (no cost recorded). A load RATE on a
 *    row whose value is unknown (null) cannot be priced: that component and the row total are
 *    null (never 0), the row is listed in `unknown`, and it is excluded from `total`.
 *  - transactionCost is already USD, so it is known even when the value is not.
 *  - Back load is estimated on today's value (the actual charge depends on the value at sale).
 */
import { assertNonNegative } from './guards';

export interface OneTimeCostInput {
  id: string;
  symbol: string;
  /** USD market value; null when unknown. */
  value: number | null;
  /** Decimal rate of value. */
  frontLoad?: number;
  /** Decimal rate of value. */
  backLoad?: number;
  /** USD. */
  transactionCost?: number;
}

export interface OneTimeCostRow {
  id: string;
  symbol: string;
  /** USD; 0 when no front load is set, null when set but value unknown. */
  frontLoad: number | null;
  backLoad: number | null;
  transactionCost: number;
  /** USD; null when any component is unknown. */
  total: number | null;
  /** true when the user entered any one-time cost for this row. */
  hasAny: boolean;
}

export interface OneTimeCosts {
  rows: OneTimeCostRow[];
  /** Sum of known row totals (USD). Understated when `unknown` is non-empty. */
  total: number;
  /** Ids of rows whose total is null. */
  unknown: string[];
  /** true when any row has a one-time cost entered. */
  hasAny: boolean;
}

function loadDollars(rate: number | undefined, value: number | null): number | null {
  if (rate === undefined) return 0;
  return value === null ? null : rate * value;
}

export function oneTimeCosts(rows: readonly OneTimeCostInput[]): OneTimeCosts {
  const out: OneTimeCostRow[] = [];
  const unknown: string[] = [];
  let total = 0;
  for (const r of rows) {
    if (r.value !== null) assertNonNegative(r.value, `value of ${r.symbol}`);
    if (r.frontLoad !== undefined) assertNonNegative(r.frontLoad, `frontLoad of ${r.symbol}`);
    if (r.backLoad !== undefined) assertNonNegative(r.backLoad, `backLoad of ${r.symbol}`);
    if (r.transactionCost !== undefined) assertNonNegative(r.transactionCost, `transactionCost of ${r.symbol}`);

    const front = loadDollars(r.frontLoad, r.value);
    const back = loadDollars(r.backLoad, r.value);
    const tx = r.transactionCost ?? 0;
    const rowTotal = front === null || back === null ? null : front + back + tx;
    const hasAny = r.frontLoad !== undefined || r.backLoad !== undefined || r.transactionCost !== undefined;
    out.push({ id: r.id, symbol: r.symbol, frontLoad: front, backLoad: back, transactionCost: tx, total: rowTotal, hasAny });
    if (rowTotal === null) unknown.push(r.id);
    else total += rowTotal;
  }
  return { rows: out, total, unknown, hasAny: out.some((r) => r.hasAny) };
}
