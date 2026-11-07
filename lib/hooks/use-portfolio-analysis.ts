'use client';

import { useMemo } from 'react';
import {
  assetClassExposure,
  concentration,
  flags as computeFlags,
  lookThrough,
  overlapMatrix,
  portfolioFees,
  sectorExposure,
  type ConcentrationMetrics,
  type Flag,
  type LookThroughInput,
  type LookThroughResult,
  type OverlapCell,
  type PortfolioFees,
} from '@/lib/finance';
import type { AssetClass, FundProfile, Position, Provenance, Quote } from '@/lib/types';
import type { CryptoPrice } from '@/lib/providers/types';
import { usePortfolio } from '@/lib/portfolio/context';
import { needsFundProfile } from '@/lib/portfolio/classify';
import { useCryptoPrices, useFundProfiles, useQuotes } from './use-market-data';
import { issuerKeyOf, NON_EQUITY_SECTOR, toGicsSector } from './normalize-bridge';

export const REFERENCE_FUND = 'VTI';

export type RowStatus = 'ok' | 'loading' | 'unpriced';

export interface PositionRow {
  position: Position;
  /**
   * Asset class used for analysis. Equals position.assetClass, except an 'equity' for which the
   * server returned a fund profile (an ETF/fund the classifier did not recognize) becomes 'fund'.
   */
  assetClass: AssetClass;
  /** true when assetClass was upgraded from 'equity' to 'fund' because a fund profile exists. */
  classInferred: boolean;
  name: string;
  /** Price per unit (USD) when known. */
  price: number | null;
  priceSource: Provenance | null;
  value: number | null;
  /** Share of total valued portfolio. */
  weight: number | null;
  expenseRatio: number | null;
  /**
   * Where the expense ratio came from: profile provenance, 'user' override, or 'direct' (no fund fee).
   * null (with expenseRatio null) = unknown, e.g. an equity whose fund-profile check has not answered.
   */
  expenseSource: Provenance | 'direct' | null;
  profile: FundProfile | null;
  status: RowStatus;
  note?: string;
}

/** Positions merged by security (same fund in several accounts = one look-through component). */
export interface Component {
  key: string;
  symbol: string;
  assetClass: AssetClass;
  name: string;
  value: number | null;
  expenseRatio: number | null;
  otherRecurringRate?: number;
  profile: FundProfile | null;
  accounts: { account: string; value: number | null }[];
  synthetic: boolean;
  input: LookThroughInput;
}

export interface FundCoverage {
  symbol: string;
  coverage: number;
  disclosed: number;
  total: number | null;
  source: Provenance;
}

export interface DataSummary {
  live: number;
  cached: number;
  sample: number;
  sampleDates: string[];
  user: number;
  missing: number;
}

export interface Analysis {
  rows: PositionRow[];
  components: Component[];
  totalValue: number;
  unpriced: string[];
  isLoading: boolean;
  isFetching: boolean;
  requestError: string | null;
  computeError: string | null;
  exposures: LookThroughResult | null;
  sectors: LookThroughResult | null;
  assetClasses: LookThroughResult | null;
  metrics: ConcentrationMetrics | null;
  overlaps: OverlapCell[];
  funds: FundCoverage[];
  flags: Flag[];
  fees: PortfolioFees | null;
  /** Value-weighted holdings coverage across the portfolio (direct positions count as 1). */
  coverage: number | null;
  counts: { funds: number; stocks: number; crypto: number; cash: number };
  referenceSectors: Record<string, number> | null;
  referenceSource: Provenance | null;
  provenance: { prices: DataSummary; profiles: DataSummary };
  hasSynthetic: boolean;
  hasAccounts: boolean;
}

function provKind(p: Provenance): 'live' | 'cached' | 'sample' | 'user' {
  if (p.source === 'seed') return 'sample';
  if (p.source === 'user' || p.source === 'starter-pack') return 'user';
  return p.stale ? 'cached' : 'live';
}

function summarize(items: (Provenance | null)[]): DataSummary {
  const s: DataSummary = { live: 0, cached: 0, sample: 0, sampleDates: [], user: 0, missing: 0 };
  const dates = new Set<string>();
  for (const p of items) {
    if (!p) {
      s.missing++;
      continue;
    }
    const k = provKind(p);
    s[k]++;
    if (k === 'sample') dates.add(p.asOf.slice(0, 10));
  }
  s.sampleDates = [...dates].sort();
  return s;
}

function titleCaseId(id: string): string {
  return id.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

const USER_PROV: Provenance = { source: 'user', asOf: '', stale: false };

export function usePortfolioAnalysis(): Analysis {
  const { state } = usePortfolio();
  const { positions, advisoryFee } = state.portfolio;

  const priceable = positions.filter((p) => !p.synthetic && (p.assetClass === 'equity' || p.assetClass === 'fund'));
  const quoteSymbols = priceable.map((p) => p.symbol);
  // Equities are probed too: an ETF the classifier did not recognize lands in 'equity' by default,
  // and a null profile is what tells us it really is a direct stock (see buildRow).
  const fundSymbols = positions.filter(needsFundProfile).map((p) => p.symbol);
  const cryptoIds = positions.filter((p) => !p.synthetic && p.assetClass === 'crypto').map((p) => p.symbol);

  const quotes = useQuotes(quoteSymbols);
  const profiles = useFundProfiles(fundSymbols);
  const crypto = useCryptoPrices(cryptoIds);
  const reference = useFundProfiles(positions.length > 0 ? [REFERENCE_FUND] : []);

  const groupByIssuer = state.groupByIssuer;
  const thresholds = state.thresholds;

  return useMemo<Analysis>(() => {
    const rowsRaw = positions.map((p) => buildRow(p, quotes.data, profiles.data, crypto.data, quotes.isLoading, profiles.isLoading, crypto.isLoading));
    const totalValue = rowsRaw.reduce((s, r) => s + (r.value ?? 0), 0);
    const rows = rowsRaw.map((r) => ({ ...r, weight: r.value !== null && totalValue > 0 ? r.value / totalValue : null }));

    // Merge by security for look-through.
    const byKey = new Map<string, PositionRow[]>();
    for (const r of rows) {
      const k = `${r.assetClass}:${r.position.symbol}`;
      byKey.set(k, [...(byKey.get(k) ?? []), r]);
    }
    const components: Component[] = [...byKey.entries()].map(([key, rs]) => buildComponent(key, rs));

    const counts = { funds: 0, stocks: 0, crypto: 0, cash: 0 };
    for (const c of components) {
      if (c.assetClass === 'fund') counts.funds++;
      else if (c.assetClass === 'equity') counts.stocks++;
      else if (c.assetClass === 'crypto') counts.crypto++;
      else counts.cash++;
    }

    const unpriced = rows.filter((r) => r.status === 'unpriced').map((r) => r.position.symbol);
    const refProfile = reference.data[REFERENCE_FUND] ?? null;

    const base: Analysis = {
      rows,
      components,
      totalValue,
      unpriced,
      isLoading: quotes.isLoading || profiles.isLoading || crypto.isLoading,
      isFetching: quotes.isFetching || profiles.isFetching || crypto.isFetching,
      requestError: quotes.error?.message ?? profiles.error?.message ?? crypto.error?.message ?? null,
      computeError: null,
      exposures: null,
      sectors: null,
      assetClasses: null,
      metrics: null,
      overlaps: [],
      funds: [],
      flags: [],
      fees: null,
      coverage: null,
      counts,
      referenceSectors: refProfile && Object.keys(refProfile.sectorWeights).length > 0 ? refProfile.sectorWeights : null,
      referenceSource: refProfile,
      provenance: {
        prices: summarize(rows.filter((r) => r.position.assetClass !== 'cash' && !r.position.synthetic && r.position.value === undefined).map((r) => r.priceSource)),
        profiles: summarize(components.filter((c) => c.assetClass === 'fund' && !c.synthetic).map((c) => c.profile)),
      },
      hasSynthetic: positions.some((p) => p.synthetic),
      hasAccounts: positions.some((p) => p.account),
    };
    if (components.length === 0) return base;

    try {
      const inputs = components.map((c) => c.input);
      const exposures = lookThrough(inputs, groupByIssuer ? { keyOf: issuerKeyOf } : undefined);
      const sectors = sectorExposure(inputs);
      const assetClasses = assetClassExposure(inputs);
      const metrics = concentration(exposures, components.length);
      const fundsWithHoldings = components.filter((c) => c.assetClass === 'fund' && c.profile && c.value !== null);
      const overlaps = overlapMatrix(
        fundsWithHoldings.map((c) => ({ symbol: c.symbol, holdings: c.profile?.holdings ?? [], holdingsCoverage: c.profile?.holdingsCoverage ?? 0 })),
      );
      const allFlags = computeFlags(exposures, sectors, overlaps, thresholds).filter(
        (f) => !(f.kind === 'single-sector' && f.subject === NON_EQUITY_SECTOR),
      );
      const fees = portfolioFees(
        components.map((c) => ({ symbol: c.symbol, value: c.value, expenseRatio: c.expenseRatio, otherRecurringRate: c.otherRecurringRate })),
        advisoryFee,
      );
      const valued = components.filter((c) => c.value !== null);
      const valuedTotal = valued.reduce((s, c) => s + (c.value ?? 0), 0);
      const coverage = valuedTotal > 0 ? valued.reduce((s, c) => s + (c.value ?? 0) * c.input.coverage, 0) / valuedTotal : null;
      const funds: FundCoverage[] = fundsWithHoldings.map((c) => ({
        symbol: c.symbol,
        coverage: c.profile?.holdingsCoverage ?? 0,
        disclosed: c.profile?.holdings.length ?? 0,
        total: c.profile?.totalHoldingsCount ?? null,
        source: c.profile ?? USER_PROV,
      }));
      return { ...base, exposures, sectors, assetClasses, metrics, overlaps, funds, flags: allFlags, fees, coverage };
    } catch (e) {
      return { ...base, computeError: e instanceof Error ? e.message : 'The analysis could not be computed for these inputs.' };
    }
  }, [positions, advisoryFee, quotes, profiles, crypto, reference, groupByIssuer, thresholds]);
}

/** Exported for unit tests. */
export function buildRow(
  p: Position,
  quotes: Record<string, Quote | null>,
  profiles: Record<string, FundProfile | null>,
  crypto: Record<string, CryptoPrice | null>,
  quotesLoading: boolean,
  profilesLoading: boolean,
  cryptoLoading: boolean,
): Omit<PositionRow, 'weight'> & { weight: null } {
  let price: number | null = null;
  let priceSource: Provenance | null = null;
  let name = p.name ?? p.symbol;
  let profile: FundProfile | null = null;
  let loading = false;
  let assetClass: AssetClass = p.assetClass;
  /** For equities: has /api/fund-profile answered (profile or explicit null)? */
  let profileAnswered = true;

  if (p.synthetic) {
    priceSource = { source: 'starter-pack', asOf: '', stale: false };
  } else if (p.assetClass === 'cash') {
    price = 1;
    name = p.name ?? 'Cash';
  } else if (p.assetClass === 'crypto') {
    const c = crypto[p.symbol] ?? null;
    if (c) {
      price = c.usd;
      priceSource = c;
    } else if (!(p.symbol in crypto) && cryptoLoading) loading = true;
    name = p.name ?? titleCaseId(p.symbol);
  } else {
    const q = quotes[p.symbol] ?? null;
    if (q) {
      price = q.price;
      priceSource = q;
      if (q.name) name = p.name ?? q.name;
    } else if (!(p.symbol in quotes) && quotesLoading) loading = true;
    if (p.assetClass === 'fund') {
      profile = profiles[p.symbol] ?? null;
      if (profile) name = p.name ?? (q?.name || profile.name);
      if (!profile && !(p.symbol in profiles) && profilesLoading) loading = true;
    } else if (p.assetClass === 'equity') {
      // Unrecognized ETFs default to 'equity'; a fund profile proves otherwise.
      profile = profiles[p.symbol] ?? null;
      profileAnswered = p.symbol in profiles;
      if (profile) {
        assetClass = 'fund';
        name = p.name ?? (q?.name || profile.name);
      }
    }
  }

  const value = p.value !== undefined ? p.value : p.quantity !== undefined && price !== null ? p.quantity * price : null;

  let expenseRatio: number | null;
  let expenseSource: PositionRow['expenseSource'];
  const override = p.feeOverrides?.expenseRatio;
  if (override !== undefined) {
    expenseRatio = override;
    expenseSource = USER_PROV;
  } else if (assetClass === 'fund') {
    expenseRatio = profile?.expenseRatio ?? null;
    expenseSource = profile;
  } else if (assetClass === 'equity' && !p.synthetic && !profileAnswered) {
    // Not yet known whether this is a stock or a fund: unknown, never 0.
    expenseRatio = null;
    expenseSource = null;
  } else {
    // Direct stocks, crypto and cash carry no fund expense ratio.
    expenseRatio = 0;
    expenseSource = 'direct';
  }

  const status: RowStatus = value !== null ? 'ok' : loading ? 'loading' : 'unpriced';
  const note = status === 'unpriced' ? 'No price available; enter a dollar value to include this position.' : undefined;
  return { position: p, assetClass, classInferred: assetClass !== p.assetClass, name, price, priceSource, value, weight: null, expenseRatio, expenseSource, profile, status, note };
}

/** Exported for unit tests. */
export function buildComponent(key: string, rs: PositionRow[]): Component {
  const first = rs[0];
  const p = first.position;
  const assetClass = first.assetClass;
  const anyNull = rs.some((r) => r.value === null);
  const value = anyNull ? null : rs.reduce((s, r) => s + (r.value ?? 0), 0);
  // Value-weighted expense ratio across accounts (accounts may carry different overrides).
  let expenseRatio: number | null = null;
  if (rs.every((r) => r.expenseRatio !== null)) {
    const tv = rs.reduce((s, r) => s + (r.value ?? 0), 0);
    expenseRatio = tv > 0 ? rs.reduce((s, r) => s + (r.value ?? 0) * (r.expenseRatio ?? 0), 0) / tv : (first.expenseRatio ?? null);
  }
  const otherRecurringRate = p.feeOverrides?.otherRecurringRate;
  const accounts = rs.filter((r) => r.position.account).map((r) => ({ account: r.position.account ?? '', value: r.value }));

  let input: LookThroughInput;
  if (assetClass === 'fund' && !p.synthetic) {
    const prof = first.profile;
    const holdings = prof?.holdings ?? [];
    const sectorWeights = prof && Object.keys(prof.sectorWeights).length > 0 ? prof.sectorWeights : undefined;
    input = {
      symbol: p.symbol,
      value,
      holdings,
      coverage: prof ? prof.holdingsCoverage : 0,
      sectorWeights,
      assetClass: 'fund',
      assetAllocation: prof?.assetAllocation ?? inferAllocation(sectorWeights),
    };
  } else if (p.assetClass === 'crypto' || p.assetClass === 'cash') {
    input = {
      symbol: p.symbol,
      value,
      holdings: [{ symbol: p.symbol, name: first.name, weight: 1 }],
      coverage: 1,
      sectorWeights: { [NON_EQUITY_SECTOR]: 1 },
      assetClass: p.assetClass,
    };
  } else {
    // Direct stock (or a synthetic starter-pack security): one holding at weight 1.
    const sector = p.sector ? toGicsSector(p.sector) : null;
    input = {
      symbol: p.symbol,
      value,
      holdings: [{ symbol: p.symbol, name: first.name, weight: 1 }],
      coverage: 1,
      sectorWeights: sector ? { [sector]: 1 } : undefined,
      assetClass: 'equity',
    };
  }
  return {
    key,
    symbol: p.symbol,
    assetClass,
    name: first.name,
    value,
    expenseRatio,
    otherRecurringRate,
    profile: first.profile,
    accounts,
    synthetic: Boolean(p.synthetic),
    input,
  };
}

/**
 * Funds that report GICS sector weights but no asset allocation are equity funds; count the
 * sector-weighted share as stocks (the remainder stays unresolved). Stated on the asset-class chart.
 */
function inferAllocation(sectors: Record<string, number> | undefined): Record<string, number> | undefined {
  if (!sectors) return undefined;
  const sum = Object.values(sectors).reduce((s, w) => s + w, 0);
  return sum > 0 ? { stock: Math.min(1, sum) } : undefined;
}
