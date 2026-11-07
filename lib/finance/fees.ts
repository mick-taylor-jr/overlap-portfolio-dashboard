/**
 * Portfolio fees (spec 5.4).
 *
 * Conventions:
 *  - Per row: annualFee = value × (expenseRatio + otherRecurringRate).
 *  - An unknown expense ratio (null) is NEVER treated as 0: that row's annualFee and totalRate
 *    are null, its symbol is listed in `unknown`, and it is excluded from fundFees and from the
 *    weighted average. A row with unknown value also has annualFee null.
 *  - Total value = sum of rows with known value (unknown-ER rows included, so the advisory fee
 *    and allInRate are on the full priced AUM).
 *  - Advisory fee is charged on total AUM via marginal tiers.
 *  - allInRate = totalAnnualFee / total value; it UNDERSTATES true cost when `unknown` is non-empty.
 *  - knownFraction = value with known ER / total value (0 for an empty portfolio).
 */
import type { AdvisoryFee } from '@/lib/types';
import type { HoldingFeeInput, HoldingFeeRow, PortfolioFees } from './contracts';
import { assertNonNegative } from './guards';
import { advisoryFeeAmount } from './advisory';

export function portfolioFees(rows: HoldingFeeInput[], advisory?: AdvisoryFee): PortfolioFees {
  const out: HoldingFeeRow[] = [];
  const unknown: string[] = [];
  let totalValue = 0;
  let knownValue = 0;
  let knownErDollars = 0;
  let fundFees = 0;

  for (const r of rows) {
    if (r.value !== null) assertNonNegative(r.value, `value of ${r.symbol}`);
    if (r.expenseRatio !== null) assertNonNegative(r.expenseRatio, `expenseRatio of ${r.symbol}`);
    const other = r.otherRecurringRate ?? 0;
    assertNonNegative(other, `otherRecurringRate of ${r.symbol}`);

    const totalRate = r.expenseRatio === null ? null : r.expenseRatio + other;
    const annualFee = totalRate === null || r.value === null ? null : r.value * totalRate;
    out.push({ symbol: r.symbol, value: r.value, expenseRatio: r.expenseRatio, annualFee, totalRate });

    if (r.expenseRatio === null) unknown.push(r.symbol);
    if (r.value !== null) {
      totalValue += r.value;
      if (r.expenseRatio !== null) {
        knownValue += r.value;
        knownErDollars += r.value * r.expenseRatio;
      }
    }
    if (annualFee !== null) fundFees += annualFee;
  }

  const advisoryFee = advisoryFeeAmount(totalValue, advisory);
  const totalAnnualFee = fundFees + advisoryFee;
  return {
    rows: out,
    fundFees,
    advisoryFee,
    totalAnnualFee,
    weightedExpenseRatio: knownValue > 0 ? knownErDollars / knownValue : null,
    allInRate: totalValue > 0 ? totalAnnualFee / totalValue : null,
    unknown,
    knownFraction: totalValue > 0 ? knownValue / totalValue : 0,
  };
}
