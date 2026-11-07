/**
 * Advisory fees: flat or tiered by AUM with MARGINAL brackets (like income tax).
 * Each dollar is charged the rate of the bracket it falls in, never the top rate on everything.
 */
import type { AdvisoryFee } from '@/lib/types';
import { assertNonNegative } from './guards';

export type Bracket = { upTo: number | null; rate: number };

/**
 * Validates brackets: non-empty; each rate finite and >= 0; `upTo` strictly ascending and > 0;
 * only the last bracket may have `upTo: null`.
 * @throws RangeError when invalid.
 */
export function validateBrackets(brackets: Bracket[]): void {
  if (brackets.length === 0) throw new RangeError('brackets must not be empty');
  let prev = 0;
  brackets.forEach((b, i) => {
    assertNonNegative(b.rate, `brackets[${i}].rate`);
    if (b.upTo === null) {
      if (i !== brackets.length - 1) throw new RangeError('only the last bracket may have upTo: null');
      return;
    }
    assertNonNegative(b.upTo, `brackets[${i}].upTo`);
    if (b.upTo <= prev) throw new RangeError('bracket upTo values must be strictly ascending and > 0');
    prev = b.upTo;
  });
}

/**
 * Marginal tiered fee in USD on `aum`.
 * If the last bracket has a finite `upTo` and AUM exceeds it, the amount above is charged at the
 * last bracket's rate (the schedule is treated as open-ended rather than throwing).
 *
 * Example: 1.00% to 1M, 0.75% to 3M, 0.50% above; AUM 2.5M -> 10,000 + 11,250 = 21,250.
 * @throws RangeError on negative/NaN AUM or invalid brackets.
 */
export function tieredFee(aum: number, brackets: Bracket[]): number {
  assertNonNegative(aum, 'aum');
  validateBrackets(brackets);
  let fee = 0;
  let lower = 0;
  for (let i = 0; i < brackets.length && lower < aum; i++) {
    const b = brackets[i];
    const isLast = i === brackets.length - 1;
    const upper = b.upTo === null || isLast ? aum : Math.min(aum, b.upTo);
    if (upper > lower) fee += (upper - lower) * b.rate;
    lower = b.upTo ?? aum;
  }
  return fee;
}

/** Advisory fee in USD on total AUM. Undefined fee = 0 (no advisory fee configured). */
export function advisoryFeeAmount(aum: number, fee: AdvisoryFee | undefined): number {
  assertNonNegative(aum, 'aum');
  if (!fee) return 0;
  if (fee.kind === 'flat') {
    assertNonNegative(fee.rate, 'rate');
    return aum * fee.rate;
  }
  return tieredFee(aum, fee.brackets);
}

/**
 * Effective (average) advisory rate = fee / AUM. At AUM 0 this returns the marginal rate of the
 * first dollar (the flat rate, or the first bracket's rate). Undefined fee = 0.
 */
export function effectiveRate(aum: number, fee: AdvisoryFee | undefined): number {
  assertNonNegative(aum, 'aum');
  if (!fee) return 0;
  if (aum === 0) {
    if (fee.kind === 'flat') {
      assertNonNegative(fee.rate, 'rate');
      return fee.rate;
    }
    validateBrackets(fee.brackets);
    return fee.brackets[0].rate;
  }
  return advisoryFeeAmount(aum, fee) / aum;
}
