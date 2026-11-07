/**
 * Future value and fee drag under stated assumptions (spec 5.5).
 *
 * Conventions (state these in the UI):
 *  - Annual compounding, `T` whole years.
 *  - Contributions `C` are made at the END of each year.
 *  - Net return = gross return `r` minus total annual fee rate `e` (simple subtraction).
 */
import type { FeeDragInput, FeeDragResult } from './contracts';
import { assertFinite, assertNonNegative, assertNonNegativeInteger } from './guards';

/**
 * Future value of a starting balance plus level end-of-year contributions.
 *
 *   FV = P·(1+g)^T + C·((1+g)^T − 1)/g,   and P + C·T when g = 0.
 *
 * Negative g is allowed (any finite g). For g > -1 the annuity factor is computed as
 * expm1(T·log1p(g))/g, which is numerically stable for |g| near 0.
 *
 * @param P starting value (USD, >= 0)
 * @param C end-of-year contribution (USD, >= 0)
 * @param g annual growth rate as a decimal (e.g. 0.065)
 * @param T horizon in whole years (integer >= 0)
 * @throws RangeError on NaN/non-finite input, negative P or C, or negative/non-integer T
 */
export function fv(P: number, C: number, g: number, T: number): number {
  assertNonNegative(P, 'P');
  assertNonNegative(C, 'C');
  assertFinite(g, 'g');
  assertNonNegativeInteger(T, 'T');
  if (T === 0) return P;
  if (g === 0) return P + C * T;
  if (g > -1) {
    const growth = Math.exp(T * Math.log1p(g));
    const annuity = Math.expm1(T * Math.log1p(g)) / g;
    return P * growth + C * annuity;
  }
  // g <= -1: base is zero or negative; use the direct formula.
  const growth = Math.pow(1 + g, T);
  return P * growth + (C * (growth - 1)) / g;
}

/** Year-by-year balance path, index 0 = start, end-of-year contributions. */
function path(P: number, C: number, g: number, T: number): number[] {
  const out: number[] = [P];
  let b = P;
  for (let t = 0; t < T; t++) {
    b = b * (1 + g) + C;
    out.push(b);
  }
  return out;
}

/**
 * Fee drag: FV(P, C, r, T) − FV(P, C, r − e, T).
 *
 * `dragPctOfGross` is drag / grossFV, or null when grossFV is 0.
 * Paths are simulated year by year; the headline FVs use the closed form.
 *
 * @throws RangeError on invalid inputs (see {@link fv}); `e` must be finite and >= 0.
 */
export function feeDrag(input: FeeDragInput): FeeDragResult {
  const { P, C, r, e, T } = input;
  assertFinite(r, 'r');
  assertNonNegative(e, 'e');
  const grossFV = fv(P, C, r, T);
  const netFV = fv(P, C, r - e, T);
  const drag = grossFV - netFV;
  return {
    grossFV,
    netFV,
    drag,
    dragPctOfGross: grossFV === 0 ? null : drag / grossFV,
    grossPath: path(P, C, r, T),
    netPath: path(P, C, r - e, T),
  };
}

/**
 * Fee drag for every (r, T) combination. Order: returns outer, horizons inner.
 */
export function sensitivityGrid(
  base: Omit<FeeDragInput, 'r' | 'T'>,
  returns: number[],
  horizons: number[],
): { r: number; T: number; result: FeeDragResult }[] {
  const out: { r: number; T: number; result: FeeDragResult }[] = [];
  for (const r of returns) {
    for (const T of horizons) {
      out.push({ r, T, result: feeDrag({ ...base, r, T }) });
    }
  }
  return out;
}

/**
 * Lump-sum ending-value ratio of schedule 1 to schedule 2 at the same gross return:
 * ((1 + r − e1) / (1 + r − e2))^T. Descriptive invariant, not a forecast.
 *
 * @throws RangeError on invalid inputs or when 1 + r − e2 is 0.
 */
export function lumpSumRatio(r: number, e1: number, e2: number, T: number): number {
  assertFinite(r, 'r');
  assertNonNegative(e1, 'e1');
  assertNonNegative(e2, 'e2');
  assertNonNegativeInteger(T, 'T');
  const denom = 1 + r - e2;
  if (denom === 0) throw new RangeError('1 + r − e2 must not be 0');
  return Math.pow((1 + r - e1) / denom, T);
}
