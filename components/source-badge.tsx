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

/**
 * Small inline badge showing where a number came from and when.
 * Seed data reads "Sample data, captured YYYY-MM-DD". Stale live data is amber.
 */
export function SourceBadge({ p, className = '' }: { p: Provenance | null | undefined; className?: string }) {
  if (!p) {
    return (
      <span className={`inline-flex items-center rounded border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground ${className}`}>
        no data
      </span>
    );
  }
  const isSeed = p.source === 'seed';
  const label = LABEL[p.source] ?? p.source;
  const text = isSeed ? `Sample data, captured ${p.asOf.slice(0, 10)}` : `${label} · ${fmtAsOf(p.asOf)}${p.stale ? ' · cached' : ''}`;
  const tone = isSeed
    ? 'border-border bg-muted text-muted-foreground'
    : p.stale
      ? 'border-warning/40 bg-warning-bg text-warning'
      : 'border-success/30 bg-success-bg text-success';
  return (
    <span
      title={`Source: ${label}. As of ${p.asOf}.${p.stale ? ' Served from cache or sample data.' : ''}`}
      className={`inline-flex items-center whitespace-nowrap rounded border px-1.5 py-0.5 text-[10px] font-medium ${tone} ${className}`}
    >
      {text}
    </span>
  );
}
