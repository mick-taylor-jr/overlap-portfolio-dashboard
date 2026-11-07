import { after, connection } from 'next/server';
import { quoteSchema, symbolsParamSchema, type QuoteResponse } from '@/lib/api-contracts';
import { getChain } from '@/lib/providers';
import { badRequest, CACHE, json, param, sanitize } from '../_lib/respond';

// Node.js runtime is the default (and required) under Cache Components; `runtime` export is not allowed.
export const maxDuration = 30;

/** GET /api/quote?symbols=AAPL,SPY */
export async function GET(request: Request): Promise<Response> {
  const raw = param(request, 'symbols');
  const parsed = symbolsParamSchema.safeParse(raw);
  if (!parsed.success) return badRequest('symbols', parsed.error.issues, raw);
  await connection();
  const r = await getChain().getQuotes(parsed.data, { defer: (t) => after(t) });
  const { values, errors } = sanitize(r.values, r.errors, quoteSchema);
  const body: QuoteResponse = { quotes: values, errors };
  return json(body, { cacheControl: Object.keys(errors).length ? CACHE.partial : CACHE.quote });
}
