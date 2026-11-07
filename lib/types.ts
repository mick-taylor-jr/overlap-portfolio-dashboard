/**
 * Shared domain contracts. Every module (finance, providers, UI) builds against these.
 * Conventions:
 *  - All weights and rates are DECIMAL FRACTIONS internally (0.05 = 5%, 0.0003 = 0.03%).
 *  - Money is plain USD numbers; rounding happens only at the display layer.
 *  - `null` means "unknown". Unknown is never coerced to 0.
 */

export type AssetClass = 'equity' | 'fund' | 'crypto' | 'cash';

/** Where a number came from. Every API-derived value carries one. */
export interface Provenance {
  /** e.g. 'yahoo', 'alphavantage', 'coingecko', 'seed', 'user', 'starter-pack' */
  source: string;
  /** ISO timestamp (or YYYY-MM-DD for seed capture dates) */
  asOf: string;
  /** true when served from cache after a failed refresh, or from seed data */
  stale: boolean;
}

/** Advisory fee: flat rate or tiered by AUM with MARGINAL brackets (like income tax). */
export type AdvisoryFee =
  | { kind: 'flat'; rate: number }
  | {
      kind: 'tiered';
      /** Ascending brackets. `upTo` null = no upper bound (must be last). */
      brackets: { upTo: number | null; rate: number }[];
    };

export interface FeeOverrides {
  /** Overrides the profile's expense ratio (decimal). */
  expenseRatio?: number;
  /** Other recurring annual cost as a decimal rate (e.g. wrap fee). */
  otherRecurringRate?: number;
  /** One-time loads as decimal rates of value. */
  frontLoad?: number;
  backLoad?: number;
  /** One-time transaction cost in USD. */
  transactionCost?: number;
}

export interface Position {
  id: string;
  /** Normalized uppercase ticker, or CoinGecko id (e.g. 'bitcoin') for crypto. */
  symbol: string;
  assetClass: AssetClass;
  /** Either quantity or value must be provided. */
  quantity?: number;
  /** USD market value override. */
  value?: number;
  costBasis?: number;
  /** Optional account label (supports starter-pack multi-account aggregation). */
  account?: string;
  /** Optional display name and GICS sector for direct positions (e.g. starter-pack synthetic securities). */
  name?: string;
  sector?: string;
  /** Marks positions loaded from explicitly synthetic data (starter pack). */
  synthetic?: boolean;
  feeOverrides?: FeeOverrides;
}

/** Portfolio-level settings the user controls. */
export interface Portfolio {
  name: string;
  positions: Position[];
  /** Advisory fee applied to the whole portfolio (marginal tiers on total AUM). */
  advisoryFee?: AdvisoryFee;
}

export interface Holding {
  /** Normalized symbol of the underlying security (see lib/normalize). */
  symbol: string;
  name: string;
  /** Decimal fraction of the fund. */
  weight: number;
}

export interface FundProfile extends Provenance {
  symbol: string;
  name: string;
  /** Decimal; null when unknown (shown as "unknown", excluded from weighted avg). */
  expenseRatio: number | null;
  holdings: Holding[];
  /** GICS sector name -> decimal weight. Empty when unknown. */
  sectorWeights: Record<string, number>;
  /** e.g. { stock: 0.99, bond: 0, cash: 0.01, other: 0 } */
  assetAllocation?: Record<string, number>;
  /** Sum of holding weights, 0..1. < 1 means overlap figures are LOWER BOUNDS. */
  holdingsCoverage: number;
  /** Total number of holdings the fund reports, when known (e.g. 503 for SPY). */
  totalHoldingsCount?: number | null;
}

export interface Quote extends Provenance {
  symbol: string;
  price: number;
  currency: string;
  name?: string;
}

export interface SymbolSearchResult {
  symbol: string;
  name: string;
  assetClass: AssetClass;
  exchange?: string;
  source: string;
}

/** A position after pricing: value is known (or null when it could not be priced). */
export interface ValuedPosition extends Position {
  resolvedValue: number | null;
  price: Quote | null;
}

/** Concentration flag thresholds (editable heuristics, never advice). */
export interface FlagThresholds {
  singleName: number; // default 0.10
  singleSector: number; // default 0.35
  pairOverlap: number; // default 0.60
}

export const DEFAULT_THRESHOLDS: FlagThresholds = {
  singleName: 0.1,
  singleSector: 0.35,
  pairOverlap: 0.6,
};

/** The 11 GICS sectors plus explicit fallbacks. */
export const GICS_SECTORS = [
  'Information Technology',
  'Health Care',
  'Financials',
  'Consumer Discretionary',
  'Communication Services',
  'Industrials',
  'Consumer Staples',
  'Energy',
  'Utilities',
  'Real Estate',
  'Materials',
] as const;
export type GicsSector = (typeof GICS_SECTORS)[number] | 'Other' | 'Unresolved / not disclosed';

export const UNRESOLVED = 'Unresolved / not disclosed';
