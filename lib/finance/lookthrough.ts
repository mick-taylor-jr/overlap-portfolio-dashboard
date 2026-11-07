/**
 * Look-through exposure (spec 5.1): e_i = Σ_f w_f · h_{f,i}, where w_f = value_f / Σ valued values.
 *
 * Conventions:
 *  - Components with `value: null` are excluded from the total and listed in `excluded`.
 *  - Weight that cannot be attributed to a named key (undisclosed holdings, holdings whose key
 *    resolves to null, missing sector/asset data) goes into ONE explicit row keyed
 *    UNRESOLVED ('Unresolved / not disclosed') with per-component contributions. It is never dropped.
 *  - A component's undisclosed weight is 1 − Σ(holding weights), clamped at 0. `coverage` is
 *    expected to equal that sum; it is used for lower-bound labelling in overlap/flags.
 *  - Rows sharing a key are merged (e.g. GOOG + GOOGL keyed to one issuer).
 *  - Rows are sorted by weight descending (ties by key), with the Unresolved row always last.
 *    The Unresolved row is omitted only when its weight is effectively zero.
 *  - An empty or zero-value portfolio yields no rows, totalValue 0 and coveredFraction 0.
 */
import { UNRESOLVED } from '@/lib/types';
import type { Exposure, LookThroughInput, LookThroughResult } from './contracts';
import { assertFinite, assertNonNegative } from './guards';

const ZERO = 1e-12;

type KeyOf = (symbol: string, name: string) => { key: string; name: string } | null;

/** Accumulates weighted contributions into rows keyed by exposure key. */
class ExposureBuilder {
  private rows = new Map<string, { name: string; contribs: Map<string, number> }>();

  add(key: string, name: string, from: string, weight: number): void {
    if (weight === 0) return;
    let row = this.rows.get(key);
    if (!row) {
      row = { name: key === UNRESOLVED ? UNRESOLVED : name, contribs: new Map() };
      this.rows.set(key, row);
    }
    row.contribs.set(from, (row.contribs.get(from) ?? 0) + weight);
  }

  build(totalValue: number, excluded: string[]): LookThroughResult {
    const resolved: Exposure[] = [];
    let unresolved: Exposure | null = null;
    for (const [key, row] of this.rows) {
      const contributions = [...row.contribs]
        .map(([from, weight]) => ({ from, weight }))
        .sort((a, b) => b.weight - a.weight || a.from.localeCompare(b.from));
      const weight = contributions.reduce((s, c) => s + c.weight, 0);
      const exp: Exposure = { key, name: row.name, weight, contributions };
      if (key === UNRESOLVED) unresolved = exp;
      else resolved.push(exp);
    }
    resolved.sort((a, b) => b.weight - a.weight || a.key.localeCompare(b.key));
    const coveredFraction = resolved.reduce((s, e) => s + e.weight, 0);
    const exposures = unresolved && unresolved.weight > ZERO ? [...resolved, unresolved] : resolved;
    return { totalValue, exposures, coveredFraction, excluded };
  }
}

/** Splits components into valued ones with portfolio weight w_f, and excluded symbols. */
function weigh(components: LookThroughInput[]): {
  totalValue: number;
  weighted: { c: LookThroughInput; w: number }[];
  excluded: string[];
} {
  const excluded: string[] = [];
  const valued: LookThroughInput[] = [];
  for (const c of components) {
    if (c.value === null) {
      excluded.push(c.symbol);
      continue;
    }
    assertNonNegative(c.value, `value of ${c.symbol}`);
    valued.push(c);
  }
  const totalValue = valued.reduce((s, c) => s + (c.value ?? 0), 0);
  const weighted =
    totalValue > 0 ? valued.map((c) => ({ c, w: (c.value ?? 0) / totalValue })) : [];
  return { totalValue, weighted, excluded };
}

function assertWeights(weights: Iterable<number>, label: string): number {
  let sum = 0;
  for (const w of weights) {
    assertNonNegative(w, label);
    sum += w;
  }
  return sum;
}

/** Security (or issuer) look-through. Default key = holding symbol. */
export function lookThrough(
  components: LookThroughInput[],
  opts?: { keyOf?: KeyOf },
): LookThroughResult {
  const keyOf: KeyOf = opts?.keyOf ?? ((symbol, name) => ({ key: symbol, name }));
  const { totalValue, weighted, excluded } = weigh(components);
  const b = new ExposureBuilder();
  for (const { c, w } of weighted) {
    assertFinite(c.coverage, `coverage of ${c.symbol}`);
    const sum = assertWeights(
      c.holdings.map((h) => h.weight),
      `holding weight in ${c.symbol}`,
    );
    for (const h of c.holdings) {
      const k = keyOf(h.symbol, h.name);
      if (k === null) b.add(UNRESOLVED, UNRESOLVED, c.symbol, w * h.weight);
      else b.add(k.key, k.name, c.symbol, w * h.weight);
    }
    b.add(UNRESOLVED, UNRESOLVED, c.symbol, w * Math.max(0, 1 - sum));
  }
  return b.build(totalValue, excluded);
}

/**
 * Sector look-through from `sectorWeights`. Components without sector weights, and any remainder
 * (1 − Σ sector weights), go to the Unresolved row.
 */
export function sectorExposure(components: LookThroughInput[]): LookThroughResult {
  const { totalValue, weighted, excluded } = weigh(components);
  const b = new ExposureBuilder();
  for (const { c, w } of weighted) {
    const sw = c.sectorWeights ?? {};
    const sum = assertWeights(Object.values(sw), `sector weight in ${c.symbol}`);
    for (const [sector, s] of Object.entries(sw)) b.add(sector, sector, c.symbol, w * s);
    b.add(UNRESOLVED, UNRESOLVED, c.symbol, w * Math.max(0, 1 - sum));
  }
  return b.build(totalValue, excluded);
}

const ALLOCATION_LABELS: Record<string, string> = {
  stock: 'Stocks',
  stocks: 'Stocks',
  equity: 'Stocks',
  bond: 'Bonds',
  bonds: 'Bonds',
  cash: 'Cash',
  other: 'Other',
  preferred: 'Other',
  convertible: 'Other',
};

const ASSET_CLASS_LABELS: Record<string, string> = {
  equity: 'Stocks',
  crypto: 'Crypto',
  cash: 'Cash',
};

/** Maps an allocation key (e.g. 'stock', 'bondPosition') to a display label; unknown keys -> 'Other'. */
function allocationLabel(key: string): string {
  const k = key.toLowerCase().replace(/position$/, '');
  return ALLOCATION_LABELS[k] ?? 'Other';
}

/**
 * Asset-class roll-up. Uses `assetAllocation` when present and non-empty (remainder -> Unresolved);
 * otherwise maps `assetClass`: equity -> Stocks, crypto -> Crypto, cash -> Cash, and a fund
 * (or anything else) without allocation data -> Unresolved.
 */
export function assetClassExposure(components: LookThroughInput[]): LookThroughResult {
  const { totalValue, weighted, excluded } = weigh(components);
  const b = new ExposureBuilder();
  for (const { c, w } of weighted) {
    const alloc = c.assetAllocation;
    if (alloc && Object.keys(alloc).length > 0) {
      const sum = assertWeights(Object.values(alloc), `allocation weight in ${c.symbol}`);
      for (const [k, a] of Object.entries(alloc)) {
        const label = allocationLabel(k);
        b.add(label, label, c.symbol, w * a);
      }
      b.add(UNRESOLVED, UNRESOLVED, c.symbol, w * Math.max(0, 1 - sum));
    } else {
      const label = ASSET_CLASS_LABELS[c.assetClass] ?? UNRESOLVED;
      b.add(label, label, c.symbol, w);
    }
  }
  return b.build(totalValue, excluded);
}
