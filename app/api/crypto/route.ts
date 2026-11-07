import { after, connection } from 'next/server';
import { cryptoIdsParamSchema, cryptoPriceSchema, type CryptoResponse } from '@/lib/api-contracts';
import { getChain } from '@/lib/providers';
import { badRequest, CACHE, json, param, sanitize } from '../_lib/respond';

export const maxDuration = 20;

/** GET /api/crypto?ids=bitcoin,ethereum  (tickers like BTC are resolved server-side; keys echo the input, lower-cased) */
export async function GET(request: Request): Promise<Response> {
  const raw = param(request, 'ids');
  const parsed = cryptoIdsParamSchema.safeParse(raw);
  if (!parsed.success) return badRequest('ids', parsed.error.issues, raw);
  await connection();
  const r = await getChain().getCryptoPrices(parsed.data, { defer: (t) => after(t) });
  const { values, errors } = sanitize(r.values, r.errors, cryptoPriceSchema);
  const body: CryptoResponse = { prices: values, errors };
  return json(body, { cacheControl: Object.keys(errors).length ? CACHE.partial : CACHE.crypto });
}
