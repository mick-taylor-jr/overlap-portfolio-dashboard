import { connection } from 'next/server';
import { healthResponseSchema } from '@/lib/api-contracts';
import { getChain } from '@/lib/providers';
import { CACHE, json } from '../_lib/respond';

export const maxDuration = 10;

/** GET /api/health: provider status, AV budget, cache backend. Never includes secrets. */
export async function GET(): Promise<Response> {
  await connection(); // reads no request data; without this Cache Components would prerender it at build
  const body = healthResponseSchema.parse(await getChain().health());
  return json(body, { cacheControl: CACHE.none });
}
