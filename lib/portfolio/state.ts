/**
 * Client-side portfolio state. Lives only in the browser (localStorage + share links).
 * Rates are decimal fractions, money is plain USD numbers.
 */
import type { AdvisoryFee, FlagThresholds, Portfolio, Position } from '@/lib/types';
import { DEFAULT_THRESHOLDS } from '@/lib/types';
import type { FeeSchedule } from '@/lib/finance/contracts';

/** Fee-drag calculator inputs. `null` means "follow the portfolio" (P = total value, e = all-in rate). */
export interface FeeAssumptions {
  P: number | null;
  C: number;
  e: number | null;
  /** Single return/horizon used for the growth chart; the sensitivity grid always spans the defaults. */
  r: number;
  T: number;
  /** Subtract one-time costs (loads, transaction costs) from P before growth. Default off. */
  includeOneTime?: boolean;
}

/** A schedule in the comparison editor. `linked` = derive from the user's portfolio until edited. */
export interface UiSchedule extends FeeSchedule {
  linked?: boolean;
}

export interface CompareSettings {
  P: number | null;
  C: number;
  r: number;
  T: number;
  schedules: UiSchedule[];
}

export interface PortfolioState {
  version: 1;
  portfolio: Portfolio;
  thresholds: FlagThresholds;
  feeAssumptions: FeeAssumptions;
  compare: CompareSettings;
  groupByIssuer: boolean;
}

export const SENSITIVITY_RETURNS = [0, 0.03, 0.05, 0.07, 0.09];
export const SENSITIVITY_HORIZONS = [10, 20, 30];
export const SHARE_NOTIONAL = 100_000;

export const DEFAULT_SCHEDULES: UiSchedule[] = [
  { id: 'current', name: 'Current: advisor 1% + funds 0.20%', fundRate: 0.002, advisory: { kind: 'flat', rate: 0.01 }, linked: true },
  { id: 'diy', name: 'DIY index: 0.05%', fundRate: 0.0005 },
  { id: 'robo', name: 'Robo: 0.25% + 0.07%', fundRate: 0.0007, advisory: { kind: 'flat', rate: 0.0025 } },
];

export const DEFAULT_ADVISORY_TIERS: AdvisoryFee = {
  kind: 'tiered',
  brackets: [
    { upTo: 1_000_000, rate: 0.01 },
    { upTo: 3_000_000, rate: 0.0075 },
    { upTo: null, rate: 0.005 },
  ],
};

export function initialState(): PortfolioState {
  return {
    version: 1,
    portfolio: { name: 'My portfolio', positions: [] },
    thresholds: { ...DEFAULT_THRESHOLDS },
    feeAssumptions: { P: null, C: 0, e: null, r: 0.07, T: 30 },
    compare: { P: null, C: 0, r: 0.07, T: 30, schedules: DEFAULT_SCHEDULES.map((s) => ({ ...s })) },
    groupByIssuer: true,
  };
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Positions must carry quantity or value; this is the single place that rule is enforced on write. */
export function isPositionValid(p: Position): boolean {
  const q = p.quantity;
  const v = p.value;
  const okQ = q !== undefined && Number.isFinite(q) && q > 0;
  const okV = v !== undefined && Number.isFinite(v) && v > 0;
  return p.symbol.trim().length > 0 && (okQ || okV);
}
