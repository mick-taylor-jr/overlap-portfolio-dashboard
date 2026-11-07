/** Display-layer formatting. Internal values are decimal fractions and plain USD numbers. */

const usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const usd2 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num2 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

export const UNKNOWN = 'unknown';

export function fmtUsd(v: number | null | undefined, opts: { cents?: boolean } = {}): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return UNKNOWN;
  return (opts.cents ? usd2 : usd0).format(v);
}

/** Compact USD for chart axes: $1.2M, $850K. */
export function fmtUsdCompact(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return UNKNOWN;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 }).format(v);
}

/** Decimal fraction -> percent string. 0.0503 -> "5.03%". */
export function fmtPct(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return UNKNOWN;
  return `${(v * 100).toFixed(digits)}%`;
}

/** Expense ratios need more precision: 0.0003 -> "0.03%". */
export function fmtRate(v: number | null | undefined): string {
  return fmtPct(v, 2);
}

/** Lower-bound aware percent: "at least 62.0%". */
export function fmtPctBound(v: number | null | undefined, lowerBound: boolean, digits = 1): string {
  const s = fmtPct(v, digits);
  return lowerBound && s !== UNKNOWN ? `≥ ${s}` : s;
}

export function fmtNum(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return UNKNOWN;
  return num2.format(v);
}

/** "2026-11-07T15:04:00Z" -> "Nov 7, 2026, 10:04 AM" (local); date-only strings stay dates. */
export function fmtAsOf(iso: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}
