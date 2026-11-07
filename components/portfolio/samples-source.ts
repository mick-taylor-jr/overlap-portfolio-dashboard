/** Sample portfolios and the synthetic starter pack, from lib/samples. */
import type { Portfolio } from '@/lib/types';
import { loadStarterPackPortfolio, SAMPLE_PORTFOLIOS, type SamplePortfolio } from '@/lib/samples';

export type SampleDef = SamplePortfolio;

export function getSamples(): readonly SampleDef[] {
  return SAMPLE_PORTFOLIOS;
}

export const STARTER_PACK_AVAILABLE = true;

export async function loadStarterPack(): Promise<{ portfolio: Portfolio; skipped: number; firstError: string | null }> {
  const r = loadStarterPackPortfolio();
  if (r.portfolio.positions.length === 0) throw new Error(r.errors[0]?.message ?? 'The starter pack file has no usable rows.');
  return { portfolio: r.portfolio, skipped: r.errors.length, firstError: r.errors[0]?.message ?? null };
}
