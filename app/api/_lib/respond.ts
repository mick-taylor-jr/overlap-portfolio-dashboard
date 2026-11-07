/** Shared helpers for the API route handlers (private folder: not a route). */
import type { z } from 'zod';

export const CACHE = {
  quote: 'public, s-maxage=60, stale-while-revalidate=240',
  crypto: 'public, s-maxage=30, stale-while-revalidate=60',
  search: 'public, s-maxage=3600, stale-while-revalidate=86400',
  fundProfile: 'public, s-maxage=86400, stale-while-revalidate=604800',
  /** Used when a batch had partial failures: let the CDN retry soon. */
  partial: 'public, s-maxage=10, stale-while-revalidate=30',
  none: 'no-store',
} as const;

export function json(body: unknown, init: { status?: number; cacheControl?: string } = {}): Response {
  return Response.json(body, {
    status: init.status ?? 200,
    headers: { 'Cache-Control': init.cacheControl ?? CACHE.none },
  });
}

const REQUIRED_HINT: Record<string, string> = {
  symbols: 'is required: comma-separated tickers, e.g. ?symbols=AAPL,SPY (max 50)',
  ids: 'is required: comma-separated CoinGecko ids or tickers, e.g. ?ids=bitcoin,eth (max 50)',
  q: 'is required, e.g. ?q=vanguard',
};

export function badRequest(param: string, issues: z.core.$ZodIssue[] | string, raw?: string): Response {
  if (raw !== undefined && raw.trim() === '' && REQUIRED_HINT[param]) {
    return json({ error: `Invalid query parameter "${param}": ${REQUIRED_HINT[param]}` }, { status: 400 });
  }
  const detail = typeof issues === 'string' ? issues : issues.map((i) => (i.path.length ? `${i.path.join('.')}: ` : '') + i.message).join('; ');
  return json({ error: `Invalid query parameter "${param}": ${detail}` }, { status: 400 });
}

/** Missing param -> '' so the schema's min(1) produces a clear error. */
export function param(request: Request, name: string): string {
  return new URL(request.url).searchParams.get(name) ?? '';
}

/**
 * Validate each provider value against the response item schema. A value that fails (e.g. a
 * provider returned a non-positive price) becomes null + an error, instead of failing the batch.
 */
export function sanitize<T>(values: Record<string, unknown>, errors: Record<string, string>, item: z.ZodType<T>): { values: Record<string, T | null>; errors: Record<string, string> } {
  const out: Record<string, T | null> = {};
  const errs: Record<string, string> = { ...errors };
  for (const [k, v] of Object.entries(values)) {
    if (v === null || v === undefined) {
      out[k] = null;
      errs[k] ??= 'unavailable';
      continue;
    }
    const p = item.safeParse(v);
    if (p.success) out[k] = p.data;
    else {
      out[k] = null;
      errs[k] = 'provider returned data that failed validation';
    }
  }
  return { values: out, errors: errs };
}
