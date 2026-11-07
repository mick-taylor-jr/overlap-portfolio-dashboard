/**
 * Share links carry symbols, asset classes, weights and fee/descriptive settings, compressed into the
 * URL hash so nothing reaches a server. PRIVACY RULE: share counts (quantity), dollar values and cost
 * basis never leave the browser, and neither does the per-position transactionCost override (a USD
 * amount). Tiered advisory brackets do carry dollar thresholds; those are schedule parameters, not
 * holdings, so they are allowed. Every field is copied through an explicit whitelist below; nothing
 * is spread from a Position. On load, weights are scaled to SHARE_NOTIONAL.
 *
 * Payload versions:
 *  - v1: { v: 1, n?, p: [symbol, assetClass, weight][] }               (still decoded)
 *  - v2: { v: 2, n?, a?: AdvisoryFee, p: SharedPositionV2[] }           (current)
 */
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import { z } from 'zod';
import type { AdvisoryFee, AssetClass, FeeOverrides, Portfolio, Position } from '@/lib/types';
import { advisoryFeeSchema } from './schema';
import { newId, SHARE_NOTIONAL } from './state';

const HASH_PREFIX = '#p=';
const SHARE_VERSION = 2;

const assetClassSchema = z.enum(['equity', 'fund', 'crypto', 'cash']);
const weightSchema = z.number().positive().max(1.0001);
const rate = z.number().min(0).max(1);

const payloadV1Schema = z.object({
  v: z.literal(1),
  n: z.string().max(120).optional(),
  p: z.array(z.tuple([z.string().min(1).max(60), assetClassSchema, weightSchema])).min(1).max(500),
});

/** Rate-only fee overrides. Short keys keep links small. */
const sharedFeesSchema = z.object({
  er: rate.optional(), // expenseRatio
  or: rate.optional(), // otherRecurringRate
  fl: rate.optional(), // frontLoad
  bl: rate.optional(), // backLoad
});

const sharedPositionV2Schema = z.object({
  s: z.string().min(1).max(60), // symbol
  c: assetClassSchema, // assetClass
  w: weightSchema, // weight
  y: z.literal(1).optional(), // synthetic
  nm: z.string().max(200).optional(), // name
  sc: z.string().max(80).optional(), // sector
  ac: z.string().max(80).optional(), // account
  f: sharedFeesSchema.optional(), // feeOverrides (rates only)
});

const payloadV2Schema = z.object({
  v: z.literal(2),
  n: z.string().max(120).optional(),
  a: advisoryFeeSchema.optional(),
  p: z.array(sharedPositionV2Schema).min(1).max(500),
});

const payloadSchema = z.discriminatedUnion('v', [payloadV1Schema, payloadV2Schema]);

type SharedFees = z.infer<typeof sharedFeesSchema>;
type SharedPositionV2 = z.infer<typeof sharedPositionV2Schema>;

export interface ShareInput {
  symbol: string;
  assetClass: AssetClass;
  /** Resolved USD value; used only to compute the weight and never written to the link. */
  value: number;
  synthetic?: boolean;
  name?: string;
  sector?: string;
  account?: string;
  feeOverrides?: FeeOverrides;
}

export interface ShareOptions {
  advisoryFee?: AdvisoryFee;
}

function sharedFees(f: FeeOverrides | undefined): SharedFees | undefined {
  if (!f) return undefined;
  const out: SharedFees = {};
  const put = (k: keyof SharedFees, v: number | undefined) => {
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1) out[k] = v;
  };
  put('er', f.expenseRatio);
  put('or', f.otherRecurringRate);
  put('fl', f.frontLoad);
  put('bl', f.backLoad);
  // transactionCost is a USD amount: deliberately never shared.
  return Object.keys(out).length ? out : undefined;
}

function sharedAdvisory(a: AdvisoryFee | undefined): AdvisoryFee | undefined {
  if (!a) return undefined;
  // Zod objects strip unknown keys, so only kind/rate/brackets survive.
  const parsed = advisoryFeeSchema.safeParse(a);
  return parsed.success ? parsed.data : undefined;
}

function clip(s: string | undefined, max: number): string | undefined {
  const t = s?.trim();
  return t ? t.slice(0, max) : undefined;
}

/** Build the hash fragment. Values are normalized to weights here; the caller passes priced values only. */
export function encodeShareHash(name: string, rows: ShareInput[], opts: ShareOptions = {}): string | null {
  // Merge duplicates of the same security that carry identical shared settings (e.g. two lots in
  // one account). Positions that differ in account, fees or synthetic flag stay separate.
  const merged = new Map<string, { entry: Omit<SharedPositionV2, 'w'>; value: number }>();
  for (const r of rows) {
    if (!(r.value > 0) || !Number.isFinite(r.value)) continue;
    const entry: Omit<SharedPositionV2, 'w'> = { s: r.symbol, c: r.assetClass };
    if (r.synthetic) entry.y = 1;
    const nm = clip(r.name, 200);
    if (nm) entry.nm = nm;
    const sc = clip(r.sector, 80);
    if (sc) entry.sc = sc;
    const ac = clip(r.account, 80);
    if (ac) entry.ac = ac;
    const f = sharedFees(r.feeOverrides);
    if (f) entry.f = f;
    const k = JSON.stringify([entry.c, entry.s, entry.ac ?? null, entry.y ?? 0, entry.f ?? null]);
    const prev = merged.get(k);
    if (prev) prev.value += r.value;
    else merged.set(k, { entry, value: r.value });
  }
  const list = [...merged.values()];
  const total = list.reduce((s, r) => s + r.value, 0);
  if (!(total > 0)) return null;
  const payload: z.infer<typeof payloadV2Schema> = {
    v: SHARE_VERSION,
    n: name.slice(0, 120),
    p: list.map(({ entry, value }) => ({ ...entry, w: Math.max(1e-6, Math.round((value / total) * 1e6) / 1e6) })),
  };
  const a = sharedAdvisory(opts.advisoryFee);
  if (a) payload.a = a;
  return HASH_PREFIX + compressToEncodedURIComponent(JSON.stringify(payload));
}

/**
 * Convenience for the UI: share a portfolio from priced rows (e.g. `analysis.rows`). Rows without a
 * value are skipped. Only whitelisted position fields are read.
 */
export function encodePortfolioShare(
  portfolio: Pick<Portfolio, 'name' | 'advisoryFee'>,
  rows: readonly { position: Position; value: number | null }[],
): string | null {
  const inputs: ShareInput[] = [];
  for (const { position: p, value } of rows) {
    if (value === null) continue;
    inputs.push({
      symbol: p.symbol,
      assetClass: p.assetClass,
      value,
      synthetic: p.synthetic,
      name: p.name,
      sector: p.sector,
      account: p.account,
      feeOverrides: p.feeOverrides,
    });
  }
  return encodeShareHash(portfolio.name, inputs, { advisoryFee: portfolio.advisoryFee });
}

export function hasShareHash(hash: string): boolean {
  return hash.startsWith(HASH_PREFIX);
}

function scaled(w: number, sum: number): number {
  return Math.round((w / sum) * SHARE_NOTIONAL * 100) / 100;
}

/** Returns a portfolio scaled to SHARE_NOTIONAL, or an error message suitable for the UI. */
export function decodeShareHash(hash: string): { portfolio: Portfolio } | { error: string } {
  if (!hasShareHash(hash)) return { error: 'This link does not contain a portfolio.' };
  let json: unknown;
  try {
    const text = decompressFromEncodedURIComponent(hash.slice(HASH_PREFIX.length));
    if (!text) return { error: 'The shared link is damaged or incomplete. Ask for a fresh link.' };
    json = JSON.parse(text);
  } catch {
    return { error: 'The shared link is damaged or incomplete. Ask for a fresh link.' };
  }
  const parsed = payloadSchema.safeParse(json);
  if (!parsed.success) return { error: 'The shared link uses an unsupported format.' };
  const data = parsed.data;
  const name = data.n ?? 'Shared portfolio';

  if (data.v === 1) {
    const sum = data.p.reduce((s, [, , w]) => s + w, 0);
    const positions: Position[] = data.p.map(([symbol, assetClass, w]) => ({ id: newId(), symbol, assetClass, value: scaled(w, sum) }));
    return { portfolio: { name, positions } };
  }

  const sum = data.p.reduce((s, r) => s + r.w, 0);
  const positions: Position[] = data.p.map((r) => {
    const p: Position = { id: newId(), symbol: r.s, assetClass: r.c, value: scaled(r.w, sum) };
    if (r.y) p.synthetic = true;
    if (r.nm) p.name = r.nm;
    if (r.sc) p.sector = r.sc;
    if (r.ac) p.account = r.ac;
    if (r.f) {
      const fo: FeeOverrides = {};
      if (r.f.er !== undefined) fo.expenseRatio = r.f.er;
      if (r.f.or !== undefined) fo.otherRecurringRate = r.f.or;
      if (r.f.fl !== undefined) fo.frontLoad = r.f.fl;
      if (r.f.bl !== undefined) fo.backLoad = r.f.bl;
      if (Object.keys(fo).length) p.feeOverrides = fo;
    }
    return p;
  });
  const portfolio: Portfolio = { name, positions };
  if (data.a) portfolio.advisoryFee = data.a;
  return { portfolio };
}
