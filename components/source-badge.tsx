import type { Provenance } from '@/lib/types';
import { fmtAsOf } from '@/lib/format';

const LABEL: Record<string, string> = {
  yahoo: 'Yahoo',
  alphavantage: 'Alpha Vantage',
  coingecko: 'CoinGecko',
  seed: 'Sample data',
  user: 'You',
  'starter-pack': 'Starter pack (synthetic)',
};

/** Fund holdings in the bundled sample were published on different dates; see docs/DATA_SOURCES.md. */
export const SEED_HOLDINGS_AS_OF = 'Sep 30–Oct 23, 2026';

function seedTitle(capturedAt: string, holdings: boolean): string {
  const base = `Sample data compiled by hand from issuer pages and stockanalysis.com, captured ${capturedAt}.`;
  return holdings
    ? `${base} Fund holdings as-of dates vary by fund (${SEED_HOLDINGS_AS_OF}).`
    : `${base} Prices are the latest close as of the capture date.`;
}

/**
 * Small inline badge showing where a number came from and when.
 * Seed data reads "Sample data, captured YYYY-MM-DD". Stale live data is amber.
 * `holdings` marks a fund profile (detected from a `holdings` field when not given), so the tooltip
 * explains that holdings as-of dates vary by fund.
 */
export function SourceBadge({ p, className = '', holdings }: { p: Provenance | null | undefined; className?: string; holdings?: boolean }) {
  if (!p) {
    return (
      <span className={`inline-flex items-center rounded border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground ${className}`}>
        no data
      </span>
    );
  }
  const isSeed = p.source === 'seed';
  // Merged fund profile, e.g. 'yahoo+seed': live fees/sectors with holdings from the bundled sample.
  const holdingsSource = 'holdingsSource' in p ? (p as { holdingsSource?: { source: string; asOf: string } }).holdingsSource : undefined;
  const isMerged = !isSeed && p.source.endsWith('+seed');
  const liveSource = isMerged ? p.source.slice(0, -'+seed'.length) : p.source;
  const label = LABEL[liveSource] ?? liveSource;
  const holdingsDate = (holdingsSource?.asOf ?? '').slice(0, 10);
  const holdingsNote = isMerged ? ` · holdings: sample data${holdingsDate ? ` ${holdingsDate}` : ''}` : '';
  const isUserish = p.source === 'user' || p.source === 'starter-pack';
  const text = isSeed
    ? `Sample data, captured ${p.asOf.slice(0, 10)}`
    : p.source === 'user'
      ? 'Your override'
      : p.source === 'starter-pack'
        ? 'Starter pack (synthetic)'
        : `${label} · ${fmtAsOf(p.asOf)}${p.stale ? ' · cached' : ''}${holdingsNote}`;
  const tone = isSeed || isUserish
    ? 'border-border bg-muted text-muted-foreground'
    : p.stale
      ? 'border-warning/40 bg-warning-bg text-warning'
      : 'border-success/30 bg-success-bg text-success';
  return (
    <span
      title={
        isSeed
          ? seedTitle(p.asOf.slice(0, 10), holdings ?? 'holdings' in p)
          : `Source: ${label}. As of ${p.asOf}.${p.stale ? ' Served from cache or sample data.' : ''}${
              isMerged ? ` Holdings from the bundled sample data${holdingsDate ? ` captured ${holdingsDate}` : ''} (more complete than the live top holdings). ${seedTitle(holdingsDate || 'n/a', true)}` : ''
            }`
      }
      className={`inline-flex items-center whitespace-nowrap rounded border px-1.5 py-0.5 text-[10px] font-medium ${tone} ${className}`}
    >
      {text}
    </span>
  );
}
