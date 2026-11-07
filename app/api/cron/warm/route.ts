import { timingSafeEqual } from 'node:crypto';
import { connection } from 'next/server';
import { getChain } from '@/lib/providers';
import { json } from '../../_lib/respond';

export const maxDuration = 60;

function authorized(header: string | null, secret: string | undefined): boolean {
  if (!secret || !header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * GET /api/cron/warm (Vercel Cron, daily). Refreshes seed-ticker fund profiles from Alpha Vantage
 * only while the daily budget is above its reserve and the per-minute limit allows; at most
 * OVERLAP_WARM_MAX (default 5) per run. Vercel sends `Authorization: Bearer ${CRON_SECRET}`.
 */
export async function GET(request: Request): Promise<Response> {
  if (!authorized(request.headers.get('authorization'), process.env.CRON_SECRET)) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }
  await connection();
  const n = Number.parseInt(process.env.OVERLAP_WARM_MAX ?? '', 10);
  const max = Number.isFinite(n) && n > 0 ? n : 5;
  // Optional ?symbols=VOO,VTI,QQQ puts those first (still within the same budget and max).
  const raw = new URL(request.url).searchParams.get('symbols') ?? '';
  const prefer = raw
    .split(',')
    .map((x) => x.trim())
    .filter((x) => /^[A-Za-z0-9.\-]{1,15}$/.test(x))
    .slice(0, 10);
  const report = await getChain().warmProfiles(max, prefer);
  return json(report);
}
