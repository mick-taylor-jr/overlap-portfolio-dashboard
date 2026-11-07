/**
 * Request/response contracts for the app's own API routes. Shared by route handlers
 * (server) and TanStack Query hooks (client). Only ticker symbols / coin ids are ever sent
 * to the server: never quantities or dollar values.
 */
import { z } from 'zod';

export const provenanceSchema = z.object({
  source: z.string(),
  asOf: z.string(),
  stale: z.boolean(),
});

export const holdingSchema = z.object({
  symbol: z.string(),
  name: z.string(),
  weight: z.number().min(0).max(1),
});

export const fundProfileSchema = provenanceSchema.extend({
  symbol: z.string(),
  name: z.string(),
  expenseRatio: z.number().min(0).max(0.2).nullable(),
  holdings: z.array(holdingSchema),
  sectorWeights: z.record(z.string(), z.number()),
  assetAllocation: z.record(z.string(), z.number()).optional(),
  holdingsCoverage: z.number().min(0).max(1.0001),
  totalHoldingsCount: z.number().int().nullable().optional(),
  holdingsSource: z.object({ source: z.string(), asOf: z.string() }).optional(),
});

export const quoteSchema = provenanceSchema.extend({
  symbol: z.string(),
  price: z.number().positive(),
  currency: z.string(),
  name: z.string().optional(),
});

export const cryptoPriceSchema = z.object({
  id: z.string(),
  usd: z.number().positive(),
  source: z.string(),
  asOf: z.string(),
  stale: z.boolean(),
});

export const searchResultSchema = z.object({
  symbol: z.string(),
  name: z.string(),
  assetClass: z.enum(['equity', 'fund', 'crypto', 'cash']),
  exchange: z.string().optional(),
  source: z.string(),
});

/** Symbols query param: comma-separated, max 50, uppercase ticker-ish characters only. */
export const symbolsParamSchema = z
  .string()
  .min(1)
  .max(1000)
  .transform((s) => s.split(',').map((x) => x.trim()).filter(Boolean))
  .pipe(z.array(z.string().regex(/^[A-Za-z0-9.\-^=]{1,15}$/)).min(1).max(50));

export const cryptoIdsParamSchema = z
  .string()
  .min(1)
  .max(1000)
  .transform((s) => s.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean))
  .pipe(z.array(z.string().regex(/^[a-z0-9\-]{1,60}$/)).min(1).max(50));

// GET /api/fund-profile?symbols=SPY,VOO
export const fundProfileResponseSchema = z.object({
  profiles: z.record(z.string(), fundProfileSchema.nullable()),
  errors: z.record(z.string(), z.string()),
});
// GET /api/quote?symbols=AAPL,SPY
export const quoteResponseSchema = z.object({
  quotes: z.record(z.string(), quoteSchema.nullable()),
  errors: z.record(z.string(), z.string()),
});
// GET /api/crypto?ids=bitcoin,ethereum  (also accepts tickers like BTC; resolved server-side)
export const cryptoResponseSchema = z.object({
  prices: z.record(z.string(), cryptoPriceSchema.nullable()),
  errors: z.record(z.string(), z.string()),
});
// GET /api/search?q=vang
export const searchResponseSchema = z.object({
  results: z.array(searchResultSchema),
});
// GET /api/health
export const healthResponseSchema = z.object({
  ok: z.boolean(),
  mode: z.enum(['live', 'seed-only']),
  providers: z.array(
    z.object({
      name: z.string(),
      configured: z.boolean(),
      circuit: z.enum(['closed', 'open', 'half-open']),
      lastError: z.string().optional(),
      lastSuccessAt: z.string().optional(),
    }),
  ),
  alphaVantageBudget: z.object({ used: z.number(), limit: z.number(), remaining: z.number(), resetsAt: z.string() }),
  cache: z.enum(['upstash', 'memory']),
  /** Env var prefix the Upstash credentials were read from (name only, e.g. 'STORAGE'). */
  cacheEnvPrefix: z.string().optional(),
  seedCapturedAt: z.string(),
});

export type FundProfileResponse = z.infer<typeof fundProfileResponseSchema>;
export type QuoteResponse = z.infer<typeof quoteResponseSchema>;
export type CryptoResponse = z.infer<typeof cryptoResponseSchema>;
export type SearchResponse = z.infer<typeof searchResponseSchema>;
export type HealthResponse = z.infer<typeof healthResponseSchema>;
