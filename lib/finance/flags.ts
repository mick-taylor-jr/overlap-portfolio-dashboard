/**
 * Concentration flags against user-editable thresholds. These are heuristics; messages are
 * plain-English DESCRIPTIONS and never advice.
 *
 * A flag fires when value > threshold (strictly). A single-name or sector flag is a lower bound
 * when the corresponding result has a non-zero Unresolved row (undisclosed weight could add to it).
 * Order: single-name, single-sector, pair-overlap; each by value descending.
 */
import { UNRESOLVED, type FlagThresholds } from '@/lib/types';
import type { Flag, LookThroughResult, OverlapCell } from './contracts';
import { EPS, assertNonNegative } from './guards';

function pct(x: number, digits: number): string {
  return `${Number((x * 100).toFixed(digits))}%`;
}

/**
 * Formats value with 1 decimal (trailing zeros trimmed), adding decimals when the rounded value
 * would read the same as the threshold (e.g. 10.04% vs 10%).
 */
function pctVsThreshold(value: number, threshold: number): [string, string] {
  const t = pct(threshold, 2);
  let digits = 1;
  let v = pct(value, digits);
  while (v === t && digits < 4) v = pct(value, ++digits);
  return [v, t];
}

function hasUnresolved(r: LookThroughResult): boolean {
  return r.exposures.some((e) => e.key === UNRESOLVED && e.weight > EPS);
}

function via(contributions: { from: string }[], key: string): string {
  if (contributions.length === 1) {
    const from = contributions[0].from;
    return from === key ? 'held directly' : `through ${from}`;
  }
  return `across ${contributions.length} positions`;
}

export function flags(
  exposures: LookThroughResult,
  sectors: LookThroughResult,
  overlaps: OverlapCell[],
  t: FlagThresholds,
): Flag[] {
  assertNonNegative(t.singleName, 'singleName threshold');
  assertNonNegative(t.singleSector, 'singleSector threshold');
  assertNonNegative(t.pairOverlap, 'pairOverlap threshold');
  const byValue = (a: Flag, b: Flag) => b.value - a.value;

  const lbNames = hasUnresolved(exposures);
  const names: Flag[] = exposures.exposures
    .filter((e) => e.key !== UNRESOLVED && e.weight > t.singleName)
    .map((e) => {
      const [v, th] = pctVsThreshold(e.weight, t.singleName);
      const label = e.key;
      return {
        kind: 'single-name',
        subject: label,
        value: e.weight,
        threshold: t.singleName,
        lowerBound: lbNames,
        message: `${label} is ${lbNames ? 'at least ' : ''}${v} of your portfolio ${via(e.contributions, e.key)}; your threshold is ${th}.`,
      };
    });

  const lbSectors = hasUnresolved(sectors);
  const secs: Flag[] = sectors.exposures
    .filter((e) => e.key !== UNRESOLVED && e.weight > t.singleSector)
    .map((e) => {
      const [v, th] = pctVsThreshold(e.weight, t.singleSector);
      return {
        kind: 'single-sector',
        subject: e.key,
        value: e.weight,
        threshold: t.singleSector,
        lowerBound: lbSectors,
        message: `${e.key} is ${lbSectors ? 'at least ' : ''}${v} of your portfolio; your threshold is ${th}.`,
      };
    });

  const pairs: Flag[] = overlaps
    .filter((o) => o.overlap > t.pairOverlap)
    .map((o) => {
      const [v, th] = pctVsThreshold(o.overlap, t.pairOverlap);
      return {
        kind: 'pair-overlap',
        subject: `${o.a} / ${o.b}`,
        value: o.overlap,
        threshold: t.pairOverlap,
        lowerBound: o.lowerBound,
        message: `${o.a} and ${o.b} share ${o.lowerBound ? 'at least ' : ''}${v} of their holdings by weight; your threshold is ${th}.`,
      };
    });

  return [...names.sort(byValue), ...secs.sort(byValue), ...pairs.sort(byValue)];
}
