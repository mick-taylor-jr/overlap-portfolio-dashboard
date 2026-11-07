import { after, connection } from 'next/server';
import { z } from 'zod';
import { searchResultSchema, type SearchResponse } from '@/lib/api-contracts';
import { getChain } from '@/lib/providers';
import { badRequest, CACHE, json, param } from '../_lib/respond';

export const maxDuration = 20;

/** lib/api-contracts has no param schema for search; this local one should move there. */
const qParamSchema = z
  .string()
  .trim()
  .min(1, 'is required')
  .max(64, 'must be at most 64 characters')
  .regex(/^[\p{L}\p{N} .&'\-^=]+$/u, 'contains unsupported characters');

/** GET /api/search?q=vang */
export async function GET(request: Request): Promise<Response> {
  const raw = param(request, 'q');
  const parsed = qParamSchema.safeParse(raw);
  if (!parsed.success) return badRequest('q', parsed.error.issues, raw);
  await connection();
  const { results, live } = await getChain().searchWithMeta(parsed.data, { defer: (t) => after(t) });
  const body: SearchResponse = { results: results.flatMap((r) => {
    const p = searchResultSchema.safeParse(r);
    return p.success ? [p.data] : [];
  }) };
  return json(body, { cacheControl: live ? CACHE.search : CACHE.partial });
}
