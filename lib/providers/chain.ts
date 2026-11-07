/**
 * Provider chain: composes adapters in the spec's fallback order, with cache + SWR + dedup.
 *
 *   quotes:       yahoo -> alphavantage -> last cached (stale:true) -> seed
 *   fund profile: alphavantage (key set + budget allows) -> yahoo -> last cached (stale:true) -> seed
 *                 (live/cached profiles take seed HOLDINGS when seed coverage is > live + 0.05: source 'yahoo+seed')
 *   Symbols are normalized (BRK.B -> BRK-B) before any provider/cache/seed lookup; results are keyed
 *   by the symbol the client sent and also by the normalized form when different.
 *   crypto:       coingecko -> last cached (stale:true) -> seed
 *   search:       yahoo -> alphavantage (securities)  +  coingecko (crypto; static table w/o key)
 *
 * Cache states (see lib/cache/types): fresh -> serve; revalidate -> serve now + background refresh
 * (on failure the entry is flagged so later reads say stale:true); expired-but-kept -> used only as
 * the "last cached" fallback. Seed and last-cached results are never written back to the cache.
 * Providers that are missing (no key) or listed in OVERLAP_DISABLE_PROVIDERS are skipped.
 */
import type { FundProfile, Quote, SymbolSearchResult } from '@/lib/types';
import type { HealthResponse } from '@/lib/api-contracts';
import { type Cache, type CacheEntry, freshness } from '@/lib/cache/types';
import type { AlphaVantageBudget } from '@/lib/cache/budget';
import { SingleFlight } from '@/lib/cache/singleflight';
import { KEEP, TTL, quoteTtlSeconds } from '@/lib/cache/ttl';
import { ProviderError, type CryptoPrice, type CryptoProvider, type FundProfileProvider, type PriceProvider, type SymbolSearchProvider } from './types';
import { disabledProviders, hasCredentials, PROVIDER_NAMES, type ProviderName } from './env';
import { breakerFor } from './guard';
import { normalizeTicker } from './sector-map';
import { resolveStatic, STATIC_TICKER_TO_ID } from './coingecko';
import type { SeedSource } from './seed';

export type SecuritiesProvider = PriceProvider & FundProfileProvider & SymbolSearchProvider;
export type CoinProvider = CryptoProvider & SymbolSearchProvider;

export interface ChainDeps {
  cache: Cache;
  budget: AlphaVantageBudget;
  seed: SeedSource;
  /** Absent = not configured (e.g. no API key). */
  yahoo?: SecuritiesProvider;
  alphavantage?: SecuritiesProvider;
  coingecko?: CoinProvider;
  env?: () => NodeJS.ProcessEnv;
  now?: () => number;
}

export interface CallOptions {
  /** Schedules background work (route handlers pass next/server `after`). */
  defer?: (task: () => Promise<void>) => void;
}

export interface BatchResult<T> {
  values: Record<string, T | null>;
  errors: Record<string, string>;
}

export interface WarmReport {
  warmed: string[];
  skipped: string[];
  failed: Record<string, string>;
  stoppedReason: string | null;
  budget: Awaited<ReturnType<AlphaVantageBudget['status']>>;
}

type Outcome<T> = { value: T } | { error: string };

const defaultDefer = (task: () => Promise<void>) => {
  void task().catch(() => undefined);
};

/** Safe, secret-free message for the `errors` map. */
export function errorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  return raw.replace(/https?:\/\/\S+/g, '<url>').replace(/apikey=[^&\s]+/gi, 'apikey=<redacted>').slice(0, 200);
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return out;
}

/** Minimum coverage advantage for seed holdings to replace live holdings. */
export const SEED_HOLDINGS_MARGIN = 0.05;

/**
 * Merge rule: seed holdings win only when seed coverage > live coverage + SEED_HOLDINGS_MARGIN.
 * Holdings/coverage/count come from seed; name, fees, sectors, allocation and provenance from live.
 */
/**
 * Serve-time guard for weights that providers occasionally report out of range (e.g. a negative
 * cash position). Floors allocation/sector weights at 0 and rescales a set that sums above 1.
 * Applied at serve time too, so profiles cached before this guard existed are still clean.
 */
export function sanitizeProfileWeights(p: FundProfile): FundProfile {
  const fix = (r: Record<string, number> | undefined): Record<string, number> | undefined => {
    if (!r) return r;
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(r)) out[k] = Number.isFinite(v) ? Math.max(0, v) : 0;
    const sum = Object.values(out).reduce((a, b) => a + b, 0);
    if (sum > 1) for (const k of Object.keys(out)) out[k] = out[k] / sum;
    return out;
  };
  return {
    ...p,
    assetAllocation: fix(p.assetAllocation),
    sectorWeights: fix(p.sectorWeights) ?? {},
    holdings: p.holdings.filter((h) => Number.isFinite(h.weight) && h.weight > 0),
  };
}

export function mergeProfileHoldings(live: FundProfile, seed: FundProfile): FundProfile {
  if (!(seed.holdingsCoverage > live.holdingsCoverage + SEED_HOLDINGS_MARGIN)) return live;
  return {
    ...live,
    holdings: seed.holdings,
    holdingsCoverage: seed.holdingsCoverage,
    totalHoldingsCount: seed.totalHoldingsCount ?? live.totalHoldingsCount ?? null,
    source: `${live.source}+seed`,
    asOf: live.asOf,
    holdingsSource: { source: seed.source, asOf: seed.asOf },
  };
}

/**
 * Normalize requested symbols (BRK.B -> BRK-B) for providers/cache/seed, and key the result by
 * what the client sent (trimmed, uppercased) plus the normalized form when it differs.
 */
export function keyedByRequest(symbols: string[]): { norms: string[]; expand: <T>(r: BatchResult<T>) => BatchResult<T> } {
  const sent = [...new Set(symbols.map((s) => s.trim().toUpperCase()).filter(Boolean))];
  const normOf = new Map(sent.map((s) => [s, normalizeTicker(s)]));
  const norms = [...new Set(normOf.values())];
  const expand = <T>(r: BatchResult<T>): BatchResult<T> => {
    const values: Record<string, T | null> = {};
    const errors: Record<string, string> = {};
    for (const s of sent) {
      const n = normOf.get(s) ?? s;
      for (const k of n === s ? [s] : [s, n]) {
        values[k] = r.values[n] ?? null;
        if (r.errors[n] !== undefined) errors[k] = r.errors[n];
      }
    }
    return { values, errors };
  };
  return { norms, expand };
}

export class ProviderChain {
  private flight = new SingleFlight();
  /** Per-item in-flight promises for batched calls (quotes, crypto). */
  private itemFlight = new Map<string, Promise<Outcome<unknown>>>();

  constructor(private deps: ChainDeps) {}

  private now() {
    return this.deps.now?.() ?? Date.now();
  }

  private active<K extends ProviderName>(name: K): ChainDeps[K] | undefined {
    const env = this.deps.env?.() ?? process.env;
    if (disabledProviders(env).has(name)) return undefined;
    return this.deps[name];
  }

  // ---------- generic cache helpers ----------

  private served<T extends { stale: boolean }>(entry: CacheEntry<T>): T {
    return { ...entry.value, stale: entry.value.stale || entry.refreshFailedAt !== undefined };
  }

  private async markRefreshFailed<T>(key: string, entry: CacheEntry<T>, keepSeconds: number): Promise<void> {
    const remaining = Math.max(1, Math.floor((entry.storedAt + keepSeconds * 1000 - this.now()) / 1000));
    await this.deps.cache.put(key, { ...entry, refreshFailedAt: this.now() }, remaining);
  }

  /**
   * Batched fetch with per-item in-flight dedup: items already being fetched by a concurrent
   * request await that promise instead of joining a new upstream call.
   */
  private async dedupBatch<T>(ns: string, items: string[], fetchBatch: (items: string[]) => Promise<Map<string, Outcome<T>>>): Promise<Map<string, Outcome<T>>> {
    const fresh = items.filter((s) => !this.itemFlight.has(`${ns}:${s}`));
    if (fresh.length) {
      const batch = fetchBatch(fresh).catch((err): Map<string, Outcome<T>> => new Map(fresh.map((s) => [s, { error: errorMessage(err) }])));
      for (const s of fresh) {
        const key = `${ns}:${s}`;
        const p: Promise<Outcome<unknown>> = batch.then((m) => m.get(s) ?? { error: 'no data returned' });
        this.itemFlight.set(key, p);
        void p.finally(() => this.itemFlight.delete(key));
      }
    }
    const out = new Map<string, Outcome<T>>();
    await Promise.all(
      items.map(async (s) => {
        const p = this.itemFlight.get(`${ns}:${s}`);
        out.set(s, p ? ((await p) as Outcome<T>) : { error: 'no data returned' });
      }),
    );
    return out;
  }

  // ---------- quotes ----------

  private async liveQuotes(symbols: string[]): Promise<Map<string, Outcome<Quote>>> {
    const out = new Map<string, Outcome<Quote>>();
    const errs: string[] = [];
    let remaining = [...symbols];
    const absorb = (quotes: Quote[]) => {
      const byNorm = new Map(quotes.map((q) => [normalizeTicker(q.symbol), q]));
      for (const s of remaining) {
        const q = byNorm.get(normalizeTicker(s));
        if (q) out.set(s, { value: q });
      }
      remaining = remaining.filter((s) => !out.has(s));
    };
    const yahoo = this.active('yahoo');
    if (yahoo && remaining.length) {
      try {
        absorb(await yahoo.getQuotes(remaining));
        if (remaining.length) errs.push('yahoo: no quote');
      } catch (err) {
        errs.push(errorMessage(err));
      }
    }
    const av = this.active('alphavantage');
    if (av && remaining.length) {
      try {
        absorb(await av.getQuotes(remaining));
        if (remaining.length) errs.push('alphavantage: no quote');
      } catch (err) {
        errs.push(errorMessage(err));
      }
    }
    const msg = errs.length ? errs.join('; ') : 'no live quote provider available';
    for (const s of remaining) out.set(s, { error: msg });
    return out;
  }

  async getQuotes(symbols: string[], opts: CallOptions = {}): Promise<BatchResult<Quote>> {
    const { norms, expand } = keyedByRequest(symbols);
    const r = await this.getQuotesNormalized(norms, opts);
    return expand(r);
  }

  /** `reqs` are already in normalizeTicker form (what providers, cache keys and seed use). */
  private async getQuotesNormalized(reqs: string[], opts: CallOptions): Promise<BatchResult<Quote>> {
    const values: Record<string, Quote | null> = {};
    const errors: Record<string, string> = {};
    const key = (s: string) => `quote:${normalizeTicker(s)}`;
    const entries = new Map<string, CacheEntry<Quote> | null>();
    const need: string[] = [];
    const revalidate: string[] = [];
    const now = this.now();

    await Promise.all(reqs.map(async (s) => entries.set(s, await this.deps.cache.get<Quote>(key(s)))));
    for (const s of reqs) {
      const e = entries.get(s);
      const f = e ? freshness(e, now) : 'expired';
      if (e && f !== 'expired') {
        values[s] = this.served(e);
        if (f === 'revalidate') revalidate.push(s);
      } else need.push(s);
    }

    const ttl = quoteTtlSeconds(new Date(now));
    const store = (s: string, q: Quote) => this.deps.cache.set(key(s), { ...q, stale: false }, { ttlSeconds: ttl, swrSeconds: ttl, keepSeconds: KEEP.quote }, this.now());

    if (need.length) {
      const live = await this.dedupBatch('quote', need, (items) => this.liveQuotes(items));
      for (const s of need) {
        const o = live.get(s);
        if (o && 'value' in o) {
          values[s] = o.value;
          await store(s, o.value);
          continue;
        }
        const old = entries.get(s);
        const seed = this.deps.seed.quote(s);
        if (old) values[s] = { ...old.value, stale: true };
        else if (seed) values[s] = seed;
        else {
          values[s] = null;
          errors[s] = o && 'error' in o ? o.error : 'unavailable';
        }
      }
    }

    if (revalidate.length) {
      (opts.defer ?? defaultDefer)(async () => {
        const live = await this.dedupBatch('quote', revalidate, (items) => this.liveQuotes(items));
        for (const s of revalidate) {
          const o = live.get(s);
          const e = entries.get(s);
          if (o && 'value' in o) await store(s, o.value);
          else if (e) await this.markRefreshFailed(key(s), e, KEEP.quote);
        }
      });
    }
    return { values, errors };
  }

  // ---------- fund profiles ----------

  private async liveProfile(symbol: string, fallbackName?: string): Promise<FundProfile> {
    const errs: string[] = [];
    const av = this.active('alphavantage');
    if (av) {
      try {
        const p = await av.getFundProfile(symbol);
        const name = p.name === p.symbol ? (this.deps.seed.profile(symbol)?.name ?? fallbackName ?? p.name) : p.name;
        return { ...p, name };
      } catch (err) {
        errs.push(errorMessage(err));
      }
    }
    const yahoo = this.active('yahoo');
    if (yahoo) {
      try {
        return await yahoo.getFundProfile(symbol);
      } catch (err) {
        errs.push(errorMessage(err));
      }
    }
    throw new ProviderError('chain', errs.length ? errs.join('; ') : 'no live fund-profile provider available', 'unavailable');
  }

  private profileKey(s: string) {
    return `profile:${normalizeTicker(s)}`;
  }

  private storeProfile(s: string, p: FundProfile) {
    return this.deps.cache.set(this.profileKey(s), { ...p, stale: false }, { ttlSeconds: TTL.fundProfile, swrSeconds: KEEP.fundProfile - TTL.fundProfile, keepSeconds: KEEP.fundProfile }, this.now());
  }

  /**
   * Live profiles may carry far fewer holdings than the bundled seed (Yahoo: top 10 only). When the
   * seed's holdingsCoverage is materially higher, serve live fees/sectors/name with seed holdings.
   * Applied at serve time, so the cache keeps the raw provider profile.
   */
  private withSeedHoldings(symbol: string, live: FundProfile): FundProfile {
    const clean = sanitizeProfileWeights(live);
    if (clean.source === 'seed' || clean.source.endsWith('+seed')) return clean;
    const seed = this.deps.seed.profile(symbol);
    return seed ? mergeProfileHoldings(clean, seed) : clean;
  }

  async getFundProfiles(symbols: string[], opts: CallOptions = {}): Promise<BatchResult<FundProfile>> {
    const { norms, expand } = keyedByRequest(symbols);
    const r = await this.getFundProfilesNormalized(norms, opts);
    return expand(r);
  }

  private async getFundProfilesNormalized(reqs: string[], opts: CallOptions): Promise<BatchResult<FundProfile>> {
    const values: Record<string, FundProfile | null> = {};
    const errors: Record<string, string> = {};
    const revalidate: Array<{ s: string; e: CacheEntry<FundProfile> }> = [];

    await mapLimit(reqs, 5, async (s) => {
      const k = this.profileKey(s);
      const e = await this.deps.cache.get<FundProfile>(k);
      const f = e ? freshness(e, this.now()) : 'expired';
      if (e && f !== 'expired') {
        values[s] = this.withSeedHoldings(s, this.served(e));
        if (f === 'revalidate') revalidate.push({ s, e });
        return;
      }
      try {
        const p = await this.flight.do(k, () => this.liveProfile(s, e?.value.name));
        await this.storeProfile(s, p);
        values[s] = this.withSeedHoldings(s, p);
      } catch (err) {
        const seed = this.deps.seed.profile(s);
        if (e) values[s] = this.withSeedHoldings(s, { ...e.value, stale: true });
        else if (seed) values[s] = seed;
        else {
          values[s] = null;
          errors[s] = errorMessage(err);
        }
      }
    });

    if (revalidate.length) {
      (opts.defer ?? defaultDefer)(async () => {
        for (const { s, e } of revalidate) {
          try {
            const p = await this.flight.do(this.profileKey(s), () => this.liveProfile(s, e.value.name));
            await this.storeProfile(s, p);
          } catch {
            await this.markRefreshFailed(this.profileKey(s), e, KEEP.fundProfile);
          }
        }
      });
    }
    return { values, errors };
  }

  /**
   * Cron warm-up: refresh seed-ticker fund profiles from Alpha Vantage ONLY, within budget.
   * Order: never cached -> cached from a non-AV source -> AV-sourced, oldest first. AV-sourced
   * entries with > 1 day of freshness left are skipped. Stops at the budget reserve.
   */
  async warmProfiles(max: number, prefer: string[] = []): Promise<WarmReport> {
    const budget = this.deps.budget;
    const report: WarmReport = { warmed: [], skipped: [], failed: {}, stoppedReason: null, budget: await budget.status() };
    const av = this.active('alphavantage');
    if (!av) {
      report.stoppedReason = 'alphavantage not configured or disabled';
      return report;
    }
    const now = this.now();
    const ranked: Array<{ s: string; rank: number; storedAt: number }> = [];
    const preferred = new Set(prefer.map((x) => normalizeTicker(x)));
    const candidates = [...new Set([...preferred, ...this.deps.seed.fundSymbols()])];
    for (const s of candidates) {
      const e = await this.deps.cache.get<FundProfile>(this.profileKey(s));
      // Explicitly requested symbols go first unless they already hold a fresh Alpha Vantage profile.
      if (preferred.has(s) && !(e && e.value.source === 'alphavantage' && e.freshUntil - now >= 24 * 3600 * 1000)) {
        ranked.push({ s, rank: -1, storedAt: e?.storedAt ?? 0 });
        continue;
      }
      if (!e) ranked.push({ s, rank: 0, storedAt: 0 });
      else if (e.value.source !== 'alphavantage') ranked.push({ s, rank: 1, storedAt: e.storedAt });
      else if (e.freshUntil - now < 24 * 3600 * 1000) ranked.push({ s, rank: 2, storedAt: e.storedAt });
      else report.skipped.push(s);
    }
    ranked.sort((a, b) => a.rank - b.rank || a.storedAt - b.storedAt);

    for (const { s } of ranked) {
      if (report.warmed.length >= max) {
        report.stoppedReason = `max ${max} per run`;
        break;
      }
      if (!(await budget.canSpend())) {
        report.stoppedReason = 'budget reserve or per-minute limit reached';
        break;
      }
      try {
        const p = await av.getFundProfile(s);
        const name = p.name === p.symbol ? (this.deps.seed.profile(s)?.name ?? p.name) : p.name;
        await this.storeProfile(s, { ...p, name });
        report.warmed.push(s);
      } catch (err) {
        report.failed[s] = errorMessage(err);
        if (err instanceof ProviderError && (err.kind === 'budget_exhausted' || err.kind === 'rate_limited' || err.kind === 'circuit_open')) {
          report.stoppedReason = `stopped: ${err.kind}`;
          break;
        }
      }
    }
    const done = new Set([...report.warmed, ...Object.keys(report.failed), ...report.skipped]);
    for (const { s } of ranked) if (!done.has(s)) report.skipped.push(s);
    report.budget = await budget.status();
    return report;
  }

  // ---------- crypto ----------

  /** Ticker or id -> CoinGecko id. Static table, then cached /search result, then live /search; else as-is. */
  async resolveCryptoId(input: string): Promise<string> {
    const q = input.trim().toLowerCase();
    const s = resolveStatic(q);
    if (s) return s;
    const k = `cgid:${q}`;
    const cached = await this.deps.cache.get<{ id: string | null; stale: boolean }>(k);
    if (cached) return cached.value.id ?? q;
    const cg = this.active('coingecko');
    if (!cg) return q;
    try {
      const id = await this.flight.do(k, () => cg.resolveId(q));
      await this.deps.cache.set(k, { id, stale: false }, { ttlSeconds: id ? KEEP.cryptoId : 24 * 3600, swrSeconds: 0 }, this.now());
      return id ?? q;
    } catch {
      return q;
    }
  }

  private async liveCrypto(ids: string[]): Promise<Map<string, Outcome<CryptoPrice>>> {
    const out = new Map<string, Outcome<CryptoPrice>>();
    const cg = this.active('coingecko');
    if (!cg) {
      for (const id of ids) out.set(id, { error: 'coingecko not configured or disabled' });
      return out;
    }
    try {
      const prices = await cg.getPrices(ids);
      const byId = new Map(prices.map((p) => [p.id, p]));
      for (const id of ids) {
        const p = byId.get(id);
        out.set(id, p ? { value: p } : { error: `coingecko: unknown coin id "${id}"` });
      }
    } catch (err) {
      for (const id of ids) out.set(id, { error: errorMessage(err) });
    }
    return out;
  }

  async getCryptoPrices(inputs: string[], opts: CallOptions = {}): Promise<BatchResult<CryptoPrice>> {
    const reqs = [...new Set(inputs.map((s) => s.trim().toLowerCase()))];
    const values: Record<string, CryptoPrice | null> = {};
    const errors: Record<string, string> = {};
    const idOf = new Map<string, string>();
    await Promise.all(reqs.map(async (r) => idOf.set(r, await this.resolveCryptoId(r))));
    const ids = [...new Set(idOf.values())];
    const key = (id: string) => `crypto:${id}`;
    const byId = new Map<string, CryptoPrice | null>();
    const errById = new Map<string, string>();
    const entries = new Map<string, CacheEntry<CryptoPrice> | null>();
    const need: string[] = [];
    const revalidate: string[] = [];
    const now = this.now();

    await Promise.all(ids.map(async (id) => entries.set(id, await this.deps.cache.get<CryptoPrice>(key(id)))));
    for (const id of ids) {
      const e = entries.get(id);
      const f = e ? freshness(e, now) : 'expired';
      if (e && f !== 'expired') {
        byId.set(id, this.served(e));
        if (f === 'revalidate') revalidate.push(id);
      } else need.push(id);
    }
    const store = (id: string, p: CryptoPrice) => this.deps.cache.set(key(id), { ...p, stale: false }, { ttlSeconds: TTL.crypto, swrSeconds: TTL.crypto, keepSeconds: KEEP.crypto }, this.now());

    if (need.length) {
      const live = await this.dedupBatch('crypto', need, (items) => this.liveCrypto(items));
      for (const id of need) {
        const o = live.get(id);
        if (o && 'value' in o) {
          byId.set(id, o.value);
          await store(id, o.value);
          continue;
        }
        const old = entries.get(id);
        const seed = this.deps.seed.crypto(id);
        if (old) byId.set(id, { ...old.value, stale: true });
        else if (seed) byId.set(id, seed);
        else {
          byId.set(id, null);
          errById.set(id, o && 'error' in o ? o.error : 'unavailable');
        }
      }
    }
    if (revalidate.length) {
      (opts.defer ?? defaultDefer)(async () => {
        const live = await this.dedupBatch('crypto', revalidate, (items) => this.liveCrypto(items));
        for (const id of revalidate) {
          const o = live.get(id);
          const e = entries.get(id);
          if (o && 'value' in o) await store(id, o.value);
          else if (e) await this.markRefreshFailed(key(id), e, KEEP.crypto);
        }
      });
    }
    for (const r of reqs) {
      const id = idOf.get(r) ?? r;
      values[r] = byId.get(id) ?? null;
      const e = errById.get(id);
      if (e) errors[r] = e;
    }
    return { values, errors };
  }

  // ---------- search ----------

  private staticCryptoMatches(q: string): SymbolSearchResult[] {
    const lq = q.toLowerCase();
    return Object.entries(STATIC_TICKER_TO_ID)
      .filter(([t, id]) => t.startsWith(lq) || id.startsWith(lq))
      .slice(0, 5)
      .map(([t, id]) => ({ symbol: id, name: `${id} (${t.toUpperCase()})`, assetClass: 'crypto' as const, source: 'static' }));
  }

  private seedMatches(q: string): SymbolSearchResult[] {
    const uq = q.toUpperCase();
    const out: SymbolSearchResult[] = [];
    for (const s of this.deps.seed.fundSymbols()) {
      const p = this.deps.seed.profile(s);
      if (s.startsWith(uq) || p?.name.toUpperCase().includes(uq)) out.push({ symbol: s, name: p?.name ?? s, assetClass: 'fund', source: 'seed' });
      if (out.length >= 10) break;
    }
    return out;
  }

  private async liveSearch(q: string): Promise<{ results: SymbolSearchResult[]; anyLive: boolean }> {
    let securities: SymbolSearchResult[] | null = null;
    const yahoo = this.active('yahoo');
    if (yahoo) {
      try {
        securities = await yahoo.search(q);
      } catch {
        securities = null;
      }
    }
    const av = this.active('alphavantage');
    if (securities === null && av) {
      try {
        securities = await av.search(q);
      } catch {
        securities = null;
      }
    }
    let crypto: SymbolSearchResult[] | null = null;
    const cg = this.active('coingecko');
    if (cg) {
      try {
        crypto = await cg.search(q);
      } catch {
        crypto = null;
      }
    }
    const anyLive = securities !== null || crypto !== null;
    const merged = [...(securities ?? this.seedMatches(q)), ...(crypto ?? this.staticCryptoMatches(q))];
    const seen = new Set<string>();
    const results = merged.filter((r) => {
      const k = `${r.assetClass}:${r.symbol}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    return { results, anyLive };
  }

  async search(query: string, opts: CallOptions = {}): Promise<SymbolSearchResult[]> {
    return (await this.searchWithMeta(query, opts)).results;
  }

  /** `live` is false when every live source failed and results come from seed/static tables. */
  async searchWithMeta(query: string, opts: CallOptions = {}): Promise<{ results: SymbolSearchResult[]; live: boolean }> {
    const q = query.trim();
    const k = `search:${q.toLowerCase()}`;
    const e = await this.deps.cache.get<{ results: SymbolSearchResult[]; stale: boolean }>(k);
    const f = e ? freshness(e, this.now()) : 'expired';
    const store = (results: SymbolSearchResult[]) => this.deps.cache.set(k, { results, stale: false }, { ttlSeconds: TTL.search, swrSeconds: TTL.search, keepSeconds: KEEP.search }, this.now());
    if (e && f !== 'expired') {
      if (f === 'revalidate') {
        (opts.defer ?? defaultDefer)(async () => {
          const r = await this.flight.do(k, () => this.liveSearch(q));
          if (r.anyLive) await store(r.results);
        });
      }
      return { results: e.value.results, live: true };
    }
    const r = await this.flight.do(k, () => this.liveSearch(q));
    if (r.anyLive) {
      await store(r.results);
      return { results: r.results, live: true };
    }
    return { results: e ? e.value.results : r.results, live: false };
  }

  // ---------- health ----------

  async health(): Promise<HealthResponse> {
    const env = this.deps.env?.() ?? process.env;
    const disabled = disabledProviders(env);
    const providers = PROVIDER_NAMES.map((name) => {
      const b = breakerFor(name);
      const present = Boolean(this.deps[name]) && hasCredentials(name, env);
      const configured = present && !disabled.has(name);
      const lastError = disabled.has(name) ? 'disabled via OVERLAP_DISABLE_PROVIDERS' : !present ? 'not configured (no API key)' : b.lastError;
      return {
        name,
        configured,
        circuit: b.state,
        ...(lastError ? { lastError: errorMessage(lastError) } : {}),
        ...(b.lastSuccessAt ? { lastSuccessAt: b.lastSuccessAt } : {}),
      };
    });
    const live = providers.filter((p) => p.configured);
    const mode = live.length ? ('live' as const) : ('seed-only' as const);
    return {
      ok: mode === 'seed-only' || live.some((p) => p.circuit !== 'open'),
      mode,
      providers,
      alphaVantageBudget: await this.deps.budget.status(),
      cache: this.deps.cache.backend,
      ...(this.deps.cache.envPrefix ? { cacheEnvPrefix: this.deps.cache.envPrefix } : {}),
      seedCapturedAt: this.deps.seed.capturedAt,
    };
  }
}
