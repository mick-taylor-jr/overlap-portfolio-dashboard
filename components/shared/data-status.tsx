'use client';

import { AlertTriangle, CircleCheck, Database } from 'lucide-react';
import { useHealth } from '@/lib/hooks/use-market-data';
import type { Analysis, DataSummary } from '@/lib/hooks/use-portfolio-analysis';
import type { HealthResponse } from '@/lib/api-contracts';
import { fmtAsOf } from '@/lib/format';
import { cn } from '@/components/ui/cn';

const PROVIDER_LABEL: Record<string, string> = {
  yahoo: 'Yahoo Finance',
  'yahoo-finance2': 'Yahoo Finance',
  alphavantage: 'Alpha Vantage',
  'alpha-vantage': 'Alpha Vantage',
  coingecko: 'CoinGecko',
  seed: 'Sample data',
};
export function providerLabel(name: string): string {
  return PROVIDER_LABEL[name.toLowerCase()] ?? name;
}

/** Turns /api/health into plain sentences about what is live, cached or sample. */
export function healthMessages(h: HealthResponse): { tone: 'warning' | 'info'; text: string }[] {
  const out: { tone: 'warning' | 'info'; text: string }[] = [];
  const seedDate = h.seedCapturedAt.slice(0, 10);
  if (h.mode === 'seed-only') {
    out.push({
      tone: 'info',
      text: `No live data providers are configured, so prices and fund profiles are sample data captured ${seedDate}. Crypto prices are live only if CoinGecko is reachable.`,
    });
    return out;
  }
  const down = h.providers.filter((p) => p.name !== 'seed' && p.configured && p.circuit !== 'closed');
  const fundDown = down.filter((p) => /alpha|yahoo/i.test(p.name));
  const cryptoDown = down.filter((p) => /coingecko/i.test(p.name));
  if (fundDown.length > 0) {
    out.push({
      tone: 'warning',
      text: `Live fund data unavailable (${fundDown.map((p) => providerLabel(p.name)).join(', ')}); showing cached values where we have them and sample data captured ${seedDate} otherwise.`,
    });
  }
  if (cryptoDown.length > 0) out.push({ tone: 'warning', text: 'Live crypto prices unavailable (CoinGecko); showing the last cached price where available.' });
  const b = h.alphaVantageBudget;
  if (b.limit > 0 && b.remaining <= 0) {
    out.push({
      tone: 'info',
      text: `The Alpha Vantage daily request budget is used (${b.used} of ${b.limit}). New fund profiles come from Yahoo, cache or sample data until ${fmtAsOf(b.resetsAt)}.`,
    });
  }
  return out;
}

function describe(label: string, s: DataSummary): string | null {
  const parts: string[] = [];
  if (s.live) parts.push(`${s.live} live`);
  if (s.cached) parts.push(`${s.cached} cached`);
  if (s.sample) parts.push(`${s.sample} sample (captured ${s.sampleDates.join(', ')})`);
  if (s.missing) parts.push(`${s.missing} unavailable`);
  if (parts.length === 0) return null;
  return `${label}: ${parts.join(', ')}`;
}

/** Page-level banner (from /api/health) plus a one-line summary of where this portfolio's numbers came from. */
export function DataStatus({ analysis }: { analysis: Analysis | null }) {
  const health = useHealth();
  const msgs = health.data ? healthMessages(health.data) : [];
  const lines = analysis
    ? [describe('Prices', analysis.provenance.prices), describe('Fund profiles', analysis.provenance.profiles)].filter((x): x is string => x !== null)
    : [];
  const allLive = analysis && analysis.provenance.prices.sample + analysis.provenance.prices.cached + analysis.provenance.profiles.sample + analysis.provenance.profiles.cached === 0;

  return (
    <div className="flex flex-col gap-2">
      {health.isError ? (
        <Banner tone="warning">The data status service did not respond. Each number still shows its own source badge.</Banner>
      ) : null}
      {msgs.map((m) => (
        <Banner key={m.text} tone={m.tone}>
          {m.text}
        </Banner>
      ))}
      {lines.length > 0 ? (
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          {allLive ? <CircleCheck className="mt-px size-3.5 shrink-0 text-success" aria-hidden /> : <Database className="mt-px size-3.5 shrink-0" aria-hidden />}
          <span>{lines.join('. ')}.</span>
        </p>
      ) : null}
    </div>
  );
}

function Banner({ tone, children }: { tone: 'warning' | 'info'; children: React.ReactNode }) {
  return (
    <div
      role={tone === 'warning' ? 'alert' : 'status'}
      className={cn(
        'flex items-start gap-2 rounded-md border px-3 py-2 text-[13px]',
        tone === 'warning' ? 'border-warning/40 bg-warning-bg text-warning' : 'border-border bg-muted text-foreground',
      )}
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <p>{children}</p>
    </div>
  );
}
