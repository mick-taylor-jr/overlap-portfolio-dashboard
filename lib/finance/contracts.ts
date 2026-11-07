/**
 * Result types and function signatures for lib/finance. Implementations live in sibling
 * modules and are re-exported from lib/finance/index.ts. All functions are PURE.
 * Weights/rates are decimal fractions. `null` = unknown, never coerced to 0.
 */
import type { AdvisoryFee, FlagThresholds, FundProfile } from '@/lib/types';

/** A portfolio component for look-through: a fund (with holdings) or a direct position. */
export interface LookThroughInput {
  /** Position symbol (fund ticker, stock ticker, or crypto id). */
  symbol: string;
  /** USD value of this component; null components are excluded and reported. */
  value: number | null;
  /** Holdings inside the component, weights as fractions of the component. Direct stock = [{symbol, weight: 1}]. */
  holdings: { symbol: string; name: string; weight: number }[];
  /** Sum of holdings weights (0..1). Direct positions = 1. */
  coverage: number;
  sectorWeights?: Record<string, number>;
  /** 'equity' | 'fund' | 'crypto' | 'cash' (asset-class roll-up). */
  assetClass: string;
  /** Optional per-component asset allocation, e.g. {stock:.6,bond:.4}. */
  assetAllocation?: Record<string, number>;
}

export interface ExposureContribution {
  /** Which portfolio component contributed. */
  from: string;
  /** Contribution as a fraction of total portfolio value (w_f * h_{f,i}). */
  weight: number;
}

export interface Exposure {
  key: string; // security symbol, issuer key, sector, or asset class
  name: string;
  weight: number; // fraction of total portfolio
  contributions: ExposureContribution[];
}

export interface LookThroughResult {
  totalValue: number; // sum of valued components
  /** Sorted descending by weight. Includes an 'Unresolved / not disclosed' row for uncovered weight. */
  exposures: Exposure[];
  /** Fraction of portfolio value resolved to named securities (sum of resolved exposure weights). */
  coveredFraction: number;
  /** Components that could not be valued (value null). */
  excluded: string[];
}

export interface ConcentrationMetrics {
  hhi: number; // sum of e_i^2 over RESOLVED exposures
  effectiveN: number; // 1 / hhi; 0 when there are no resolved exposures (hhi === 0)
  top1: number;
  top5: number;
  top10: number;
  naiveCount: number; // number of portfolio positions
  distinctCount: number; // number of distinct resolved securities
}

export interface OverlapCell {
  a: string;
  b: string;
  overlap: number; // sum_i min(h_A,i, h_B,i)
  /** true if either fund has coverage < 1: value is a LOWER BOUND ("at least X%"). */
  lowerBound: boolean;
}

export interface Flag {
  kind: 'single-name' | 'single-sector' | 'pair-overlap';
  subject: string; // e.g. 'AAPL', 'Information Technology', 'SPY / VOO'
  value: number;
  threshold: number;
  lowerBound: boolean;
  message: string; // plain-English, descriptive, never advice
}

export interface HoldingFeeInput {
  symbol: string;
  value: number | null;
  expenseRatio: number | null; // null = unknown
  otherRecurringRate?: number;
}

export interface HoldingFeeRow {
  symbol: string;
  value: number | null;
  expenseRatio: number | null;
  annualFee: number | null; // null when expense ratio or value unknown
  totalRate: number | null;
}

export interface PortfolioFees {
  rows: HoldingFeeRow[];
  /** Fund-level fees in USD over holdings with known ratio. */
  fundFees: number;
  /** Advisory fee in USD on total AUM (marginal tiers). */
  advisoryFee: number;
  totalAnnualFee: number;
  /** Value-weighted avg expense ratio over KNOWN rows only. */
  weightedExpenseRatio: number | null;
  /** totalAnnualFee / total value (all-in). */
  allInRate: number | null;
  /** Symbols with unknown expense ratio (excluded from weighted avg; warn in UI). */
  unknown: string[];
  /** Fraction of portfolio value whose expense ratio is known. */
  knownFraction: number;
}

export interface FeeDragInput {
  P: number;
  C: number; // end-of-year contribution
  r: number; // gross return assumption
  e: number; // total annual fee rate
  T: number; // years (integer >= 0)
}

export interface FeeDragResult {
  grossFV: number;
  netFV: number;
  drag: number;
  dragPctOfGross: number | null;
  /** Year-by-year paths, index 0 = start. */
  grossPath: number[];
  netPath: number[];
}

export interface FeeSchedule {
  id: string;
  name: string;
  /** Fund expense rate (decimal). */
  fundRate: number;
  advisory?: AdvisoryFee;
  otherRecurringRate?: number;
}

export interface ScheduleComparisonPoint {
  r: number;
  T: number;
  /** Ending values per schedule id. */
  ending: Record<string, number>;
  /** Cumulative fees paid per schedule id (sum of yearly fees). */
  cumulativeFees: Record<string, number>;
}

export type FinanceApi = {
  fv(P: number, C: number, g: number, T: number): number;
  feeDrag(input: FeeDragInput): FeeDragResult;
  sensitivityGrid(
    base: Omit<FeeDragInput, 'r' | 'T'>,
    returns: number[],
    horizons: number[],
  ): { r: number; T: number; result: FeeDragResult }[];
  tieredFee(aum: number, brackets: { upTo: number | null; rate: number }[]): number;
  advisoryFeeAmount(aum: number, fee: AdvisoryFee | undefined): number;
  effectiveRate(aum: number, fee: AdvisoryFee | undefined): number;
  /**
   * keyOf maps a holding symbol to its grouping key (e.g. issuer: GOOG & GOOGL -> 'Alphabet').
   * Default groups by symbol. Holdings for which keyOf returns null go to the Unresolved bucket.
   */
  lookThrough(
    components: LookThroughInput[],
    opts?: { keyOf?: (symbol: string, name: string) => { key: string; name: string } | null },
  ): LookThroughResult;
  sectorExposure(components: LookThroughInput[]): LookThroughResult;
  assetClassExposure(components: LookThroughInput[]): LookThroughResult;
  concentration(result: LookThroughResult, naiveCount: number): ConcentrationMetrics;
  overlap(a: Pick<FundProfile, 'holdings' | 'holdingsCoverage'>, b: Pick<FundProfile, 'holdings' | 'holdingsCoverage'>): {
    overlap: number;
    lowerBound: boolean;
  };
  overlapMatrix(funds: { symbol: string; holdings: FundProfile['holdings']; holdingsCoverage: number }[]): OverlapCell[];
  flags(
    exposures: LookThroughResult,
    sectors: LookThroughResult,
    overlaps: OverlapCell[],
    t: FlagThresholds,
  ): Flag[];
  portfolioFees(rows: HoldingFeeInput[], advisory?: AdvisoryFee): PortfolioFees;
  compareSchedules(
    schedules: FeeSchedule[],
    opts: { P: number; C: number; returns: number[]; horizons: number[] },
  ): ScheduleComparisonPoint[];
  /** Lump-sum ratio invariant ((1+r-e1)/(1+r-e2))^T. */
  lumpSumRatio(r: number, e1: number, e2: number, T: number): number;
};
