/**
 * Input guards shared by the finance modules. Every public function validates its inputs
 * and throws a RangeError (never returns NaN) when an input is unusable.
 */

/** Tolerance used when comparing fractions (coverage, weights) to 1 or 0. */
export const EPS = 1e-6;

/** Throws RangeError unless `x` is a finite number. */
export function assertFinite(x: number, label: string): void {
  if (typeof x !== 'number' || !Number.isFinite(x)) {
    throw new RangeError(`${label} must be a finite number (got ${String(x)})`);
  }
}

/** Throws RangeError unless `x` is a finite number >= 0. */
export function assertNonNegative(x: number, label: string): void {
  assertFinite(x, label);
  if (x < 0) throw new RangeError(`${label} must be >= 0 (got ${x})`);
}

/** Throws RangeError unless `x` is an integer >= 0 (used for horizons in years and counts). */
export function assertNonNegativeInteger(x: number, label: string): void {
  assertNonNegative(x, label);
  if (!Number.isInteger(x)) throw new RangeError(`${label} must be an integer (got ${x})`);
}
