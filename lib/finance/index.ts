/**
 * Pure finance core for Overlap. Import from '@/lib/finance'.
 * All weights/rates are decimal fractions; money is plain USD; `null` = unknown (never 0).
 * Invalid inputs (NaN, negative or non-integer horizons, negative values) throw RangeError.
 */
import type { FinanceApi } from './contracts';
import { fv, feeDrag, sensitivityGrid, lumpSumRatio } from './growth';
import { tieredFee, advisoryFeeAmount, effectiveRate, validateBrackets } from './advisory';
import { lookThrough, sectorExposure, assetClassExposure } from './lookthrough';
import { concentration } from './concentration';
import { overlap, overlapMatrix } from './overlap';
import { flags } from './flags';
import { portfolioFees } from './fees';
import { compareSchedules } from './schedules';
import { oneTimeCosts } from './one-time';

export type { OneTimeCostInput, OneTimeCostRow, OneTimeCosts } from './one-time';

export * from './contracts';
export {
  fv,
  feeDrag,
  sensitivityGrid,
  lumpSumRatio,
  tieredFee,
  advisoryFeeAmount,
  effectiveRate,
  validateBrackets,
  lookThrough,
  sectorExposure,
  assetClassExposure,
  concentration,
  overlap,
  overlapMatrix,
  flags,
  portfolioFees,
  compareSchedules,
  oneTimeCosts,
};

export const finance: FinanceApi = {
  fv,
  feeDrag,
  sensitivityGrid,
  tieredFee,
  advisoryFeeAmount,
  effectiveRate,
  lookThrough,
  sectorExposure,
  assetClassExposure,
  concentration,
  overlap,
  overlapMatrix,
  flags,
  portfolioFees,
  compareSchedules,
  lumpSumRatio,
};
