/** Zod schemas for everything the browser reads back (localStorage, imported JSON, share links). */
import { z } from 'zod';
import type { PortfolioState } from './state';
import { initialState } from './state';

const rate = z.number().min(0).max(1);
const assetClass = z.enum(['equity', 'fund', 'crypto', 'cash']);

export const advisoryFeeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('flat'), rate }),
  z.object({ kind: z.literal('tiered'), brackets: z.array(z.object({ upTo: z.number().positive().nullable(), rate })).min(1).max(10) }),
]);

const feeOverridesSchema = z.object({
  expenseRatio: rate.optional(),
  otherRecurringRate: rate.optional(),
  frontLoad: rate.optional(),
  backLoad: rate.optional(),
  transactionCost: z.number().min(0).optional(),
});

export const positionSchema = z
  .object({
    id: z.string().min(1).max(80),
    symbol: z.string().min(1).max(60),
    assetClass,
    quantity: z.number().positive().finite().optional(),
    value: z.number().positive().finite().optional(),
    costBasis: z.number().finite().optional(),
    account: z.string().max(80).optional(),
    name: z.string().max(200).optional(),
    sector: z.string().max(80).optional(),
    synthetic: z.boolean().optional(),
    feeOverrides: feeOverridesSchema.optional(),
  })
  .refine((p) => p.quantity !== undefined || p.value !== undefined, { message: 'Each position needs a quantity or a value' });

export const portfolioSchema = z.object({
  name: z.string().max(120),
  positions: z.array(positionSchema).max(500),
  advisoryFee: advisoryFeeSchema.optional(),
});

const scheduleSchema = z.object({
  id: z.string(),
  name: z.string().max(120),
  fundRate: rate,
  advisory: advisoryFeeSchema.optional(),
  otherRecurringRate: rate.optional(),
  linked: z.boolean().optional(),
});

export const stateSchema = z.object({
  version: z.literal(1),
  portfolio: portfolioSchema,
  thresholds: z.object({ singleName: rate, singleSector: rate, pairOverlap: rate }),
  feeAssumptions: z.object({
    P: z.number().min(0).nullable(),
    C: z.number().min(0),
    e: rate.nullable(),
    r: z.number().min(-0.5).max(0.5),
    T: z.number().int().min(1).max(60),
  }),
  compare: z.object({
    P: z.number().min(0).nullable(),
    C: z.number().min(0),
    r: z.number().min(-0.5).max(0.5),
    T: z.number().int().min(1).max(60),
    schedules: z.array(scheduleSchema).min(2).max(4),
  }),
  groupByIssuer: z.boolean(),
});

/** Parse persisted state; any field that fails falls back to defaults rather than discarding the portfolio. */
export function parseState(raw: unknown): PortfolioState | null {
  const full = stateSchema.safeParse(raw);
  if (full.success) return full.data;
  if (raw && typeof raw === 'object' && 'portfolio' in raw) {
    const p = portfolioSchema.safeParse((raw as { portfolio: unknown }).portfolio);
    if (p.success) return { ...initialState(), portfolio: p.data };
  }
  return null;
}
