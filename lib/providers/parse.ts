import { z } from 'zod';

/**
 * Lenient numeric: number | numeric string | Yahoo raw/fmt object {raw: number}. Everything
 * else (including "n/a", "", "None", "-") becomes null. Never coerces unknown to 0.
 */
export function toNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const s = v.trim().replace(/,/g, '').replace(/%$/, '');
    if (s === '' || !/^[-+]?\d*\.?\d+(e[-+]?\d+)?$/i.test(s)) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }
  if (typeof v === 'object' && v !== null && 'raw' in v) return toNumber((v as { raw: unknown }).raw);
  return null;
}

export const looseNumber = z.unknown().transform((v) => toNumber(v));

const hasPercentSign = (v: unknown) => typeof v === 'string' && v.trim().endsWith('%');

/**
 * Parse a list of weights that may be decimal ("0.0718") or percent ("7.18" / "7.18%").
 * The scale is decided for the WHOLE list, because a lone "0.5" is ambiguous (0.5% or 50%):
 * percent if any value carries "%", any value > 1, or the decimals would sum to > 1.05.
 * Returns decimals (null where unparseable).
 */
export function parseWeights(values: unknown[]): { weights: (number | null)[]; scale: 'decimal' | 'percent' } {
  const nums = values.map(toNumber);
  const finite = nums.filter((n): n is number => n !== null);
  const sum = finite.reduce((a, b) => a + b, 0);
  const percent = values.some(hasPercentSign) || finite.some((n) => n > 1) || sum > 1.05;
  return {
    scale: percent ? 'percent' : 'decimal',
    weights: nums.map((n) => (n === null || n < 0 ? null : percent ? n / 100 : n)),
  };
}

/**
 * Expense ratio as a decimal. Providers have been seen to use both decimal (0.0009) and percent
 * (0.09) encodings. A "%" suffix, or a value > 0.05, is treated as percent: no ETF/fund in scope
 * has a 5%+ expense ratio, while 0.05-2.0 is a plausible percent-encoded value. Out of the
 * contract range [0, 0.2] -> null (unknown), never clamped.
 */
export function parseExpenseRatio(v: unknown): number | null {
  const n = toNumber(v);
  if (n === null || n < 0) return null;
  const dec = hasPercentSign(v) || n > 0.05 ? n / 100 : n;
  return dec >= 0 && dec <= 0.2 ? dec : null;
}

export function toIso(v: unknown, fallback: string): string {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString();
  if (typeof v === 'number' && Number.isFinite(v)) {
    // epoch seconds vs ms
    const ms = v < 1e12 ? v * 1000 : v;
    return new Date(ms).toISOString();
  }
  if (typeof v === 'string') {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return fallback;
}

export const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
