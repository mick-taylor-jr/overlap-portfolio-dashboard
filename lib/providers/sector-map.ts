/**
 * Thin adapter over lib/normalize (owned by the normalization workstream): providers use the
 * canonical ticker form (e.g. 'BRK-B') and GICS sector mapping from there.
 */
import { normalizeTicker as canonicalTicker, toGicsSector } from '@/lib/normalize';

export { toGicsSector };

/** Canonical ticker; falls back to the trimmed upper-case input if normalization yields ''. */
export function normalizeTicker(sym: string): string {
  return canonicalTicker(sym) || sym.trim().toUpperCase();
}

/** Map provider sector labels to GICS and sum duplicates. Non-positive/NaN weights are dropped. */
export function mapSectorWeights(entries: Array<[string, number]>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [label, w] of entries) {
    if (!Number.isFinite(w) || w <= 0) continue;
    const s = toGicsSector(label);
    out[s] = (out[s] ?? 0) + w;
  }
  return out;
}
