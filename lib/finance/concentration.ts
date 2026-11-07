/**
 * Concentration metrics (spec 5.3), computed on RESOLVED exposures only (the Unresolved row is
 * excluded). Weights stay as fractions of the whole portfolio; they are NOT renormalized.
 */
import { UNRESOLVED } from '@/lib/types';
import type { ConcentrationMetrics, LookThroughResult } from './contracts';
import { assertNonNegativeInteger } from './guards';

/**
 * @param naiveCount number of portfolio positions (integer >= 0)
 *
 * `effectiveN` = 1 / HHI. When HHI is 0 (no resolved exposures, e.g. an empty portfolio)
 * effectiveN is 0 rather than Infinity: the contract type is `number`, and 0 matches
 * distinctCount = 0 and serializes safely to JSON.
 */
export function concentration(result: LookThroughResult, naiveCount: number): ConcentrationMetrics {
  assertNonNegativeInteger(naiveCount, 'naiveCount');
  const weights = result.exposures
    .filter((e) => e.key !== UNRESOLVED)
    .map((e) => e.weight)
    .sort((a, b) => b - a);
  const hhi = weights.reduce((s, w) => s + w * w, 0);
  const top = (k: number) => weights.slice(0, k).reduce((s, w) => s + w, 0);
  return {
    hhi,
    effectiveN: hhi > 0 ? 1 / hhi : 0,
    top1: top(1),
    top5: top(5),
    top10: top(10),
    naiveCount,
    distinctCount: weights.filter((w) => w > 0).length,
  };
}
