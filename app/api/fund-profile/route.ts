import { after, connection } from 'next/server';
import { fundProfileSchema, symbolsParamSchema, type FundProfileResponse } from '@/lib/api-contracts';
import { getChain } from '@/lib/providers';
import { badRequest, CACHE, json, param, sanitize } from '../_lib/respond';

export const maxDuration = 30;

/** GET /api/fund-profile?symbols=SPY,VOO */
export async function GET(request: Request): Promise<Response> {
  const raw = param(request, 'symbols');
  const parsed = symbolsParamSchema.safeParse(raw);
  if (!parsed.success) return badRequest('symbols', parsed.error.issues, raw);
  await connection();
  const r = await getChain().getFundProfiles(parsed.data, { defer: (t) => after(t) });
  const { values, errors } = sanitize(r.values, r.errors, fundProfileSchema);
  const body: FundProfileResponse = { profiles: values, errors };
  return json(body, { cacheControl: Object.keys(errors).length ? CACHE.partial : CACHE.fundProfile });
}
