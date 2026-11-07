/**
 * Share links carry ONLY symbols, asset classes and weights (never share counts or dollar values),
 * compressed into the URL hash so nothing reaches a server. On load, weights are scaled to a notional.
 */
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import { z } from 'zod';
import type { AssetClass, Portfolio, Position } from '@/lib/types';
import { newId, SHARE_NOTIONAL } from './state';

const HASH_PREFIX = '#p=';

const payloadSchema = z.object({
  v: z.literal(1),
  n: z.string().max(120).optional(),
  p: z
    .array(z.tuple([z.string().min(1).max(60), z.enum(['equity', 'fund', 'crypto', 'cash']), z.number().positive().max(1.0001)]))
    .min(1)
    .max(500),
});

export interface ShareInput {
  symbol: string;
  assetClass: AssetClass;
  value: number;
}

/** Build the hash fragment. Values are normalized to weights here; the caller passes priced values only. */
export function encodeShareHash(name: string, rows: ShareInput[]): string | null {
  // Merge duplicate securities (e.g. the same fund in two accounts) so the link leaks no account structure.
  const merged = new Map<string, ShareInput>();
  for (const r of rows) {
    if (!(r.value > 0)) continue;
    const k = `${r.assetClass}:${r.symbol}`;
    const prev = merged.get(k);
    merged.set(k, prev ? { ...prev, value: prev.value + r.value } : { ...r });
  }
  const list = [...merged.values()];
  const total = list.reduce((s, r) => s + r.value, 0);
  if (!(total > 0)) return null;
  const payload = {
    v: 1 as const,
    n: name.slice(0, 120),
    p: list.map((r) => [r.symbol, r.assetClass, Math.round((r.value / total) * 1e6) / 1e6] as const),
  };
  return HASH_PREFIX + compressToEncodedURIComponent(JSON.stringify(payload));
}

export function hasShareHash(hash: string): boolean {
  return hash.startsWith(HASH_PREFIX);
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
  const sum = parsed.data.p.reduce((s, [, , w]) => s + w, 0);
  const positions: Position[] = parsed.data.p.map(([symbol, assetClass, w]) => ({
    id: newId(),
    symbol,
    assetClass,
    value: Math.round((w / sum) * SHARE_NOTIONAL * 100) / 100,
  }));
  return { portfolio: { name: parsed.data.n ?? 'Shared portfolio', positions } };
}
