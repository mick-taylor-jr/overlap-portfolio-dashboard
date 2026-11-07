import { effectiveRate, type PortfolioFees } from '@/lib/finance';
import type { AdvisoryFee } from '@/lib/types';
import type { UiSchedule } from '@/lib/portfolio/state';
import { fmtRate } from '@/lib/format';

/** Total annual rate of a schedule at a given balance (tiers make it balance-dependent). */
export function scheduleRate(s: UiSchedule, balance: number): number {
  return s.fundRate + (s.otherRecurringRate ?? 0) + effectiveRate(Math.max(0, balance), s.advisory);
}

function advisoryLabel(a: AdvisoryFee | undefined, balance: number): string {
  if (!a) return 'no advisor';
  if (a.kind === 'flat') return `advisor ${fmtRate(a.rate).replace(/\.00%$/, '%')}`;
  return `advisor tiered (${fmtRate(effectiveRate(Math.max(0, balance), a))} effective)`;
}

/** Id of the illustrative "with a 1% advisor" schedule shown when the portfolio has no advisory fee. */
export const ADVISOR_EXAMPLE_ID = 'advisor-example';
export const ADVISOR_EXAMPLE_NAME = 'Example: with a 1% advisor';

/**
 * "Current" mirrors the user's portfolio until edited: weighted fund ratio + THEIR advisory fee.
 * No advisory fee on the portfolio means no advisor here: the default schedule's placeholder
 * advisory fee is never carried over, or "Following your portfolio" would be false.
 */
export function linkedCurrent(base: UiSchedule, fees: PortfolioFees | null, advisory: AdvisoryFee | undefined, balance: number): UiSchedule {
  const fundRate = fees?.weightedExpenseRatio ?? base.fundRate;
  return {
    ...base,
    fundRate,
    advisory,
    name: `Current: ${advisoryLabel(advisory, balance)} + funds ${fmtRate(fundRate)}`,
  };
}

/** Illustrative schedule: the portfolio's own funds plus a flat 1% advisory fee. Clearly an example. */
export function advisorExample(fees: PortfolioFees | null, fallbackFundRate: number): UiSchedule {
  const fundRate = fees?.weightedExpenseRatio ?? fallbackFundRate;
  return {
    id: ADVISOR_EXAMPLE_ID,
    name: ADVISOR_EXAMPLE_NAME,
    fundRate,
    advisory: { kind: 'flat', rate: 0.01 },
    linked: true,
  };
}

/** A linked schedule resolves against the portfolio: "Current" or the advisor example. */
export function resolveLinked(
  s: UiSchedule,
  fees: PortfolioFees | null,
  advisory: AdvisoryFee | undefined,
  balance: number,
  fallbackFundRate: number,
): UiSchedule {
  if (!s.linked) return s;
  if (s.id === ADVISOR_EXAMPLE_ID) return advisorExample(fees, fallbackFundRate);
  return linkedCurrent(s, fees, advisory, balance);
}
