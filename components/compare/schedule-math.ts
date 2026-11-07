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

/** "Current" mirrors the user's portfolio until edited: weighted fund ratio + their advisory fee. */
export function linkedCurrent(base: UiSchedule, fees: PortfolioFees | null, advisory: AdvisoryFee | undefined, balance: number): UiSchedule {
  const fundRate = fees?.weightedExpenseRatio ?? base.fundRate;
  const adv = advisory ?? base.advisory;
  return {
    ...base,
    fundRate,
    advisory: adv,
    name: `Current: ${advisoryLabel(adv, balance)} + funds ${fmtRate(fundRate)}`,
  };
}
