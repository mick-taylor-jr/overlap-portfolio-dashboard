'use client';

import { useHealth } from '@/lib/hooks/use-market-data';
import { fmtAsOf } from '@/lib/format';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { healthMessages, providerLabel } from '@/components/shared/data-status';

const ROLE: Record<string, string> = {
  yahoo: 'Quotes, fund holdings (top 10), symbol search',
  alphavantage: 'Fund profiles (ETF_PROFILE), quote fallback',
  coingecko: 'Crypto prices, ticker-to-id resolution',
  seed: 'Bundled sample data when live sources fail',
};

/** Live provider status from /api/health. No secrets are exposed by that endpoint. */
export function ProviderStatus() {
  const h = useHealth();
  if (h.isPending)
    return (
      <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading provider status">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-8" />
        ))}
      </div>
    );
  if (h.isError || !h.data) return <p className="text-[13px] text-warning">The status endpoint did not respond, so live provider status is unknown right now.</p>;
  const d = h.data;
  const msgs = healthMessages(d);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13px]">
        Mode: <strong className="font-medium">{d.mode === 'live' ? 'live providers configured' : 'sample data only (no API keys configured)'}</strong>. Cache:{' '}
        {d.cache === 'upstash' ? 'Upstash Redis' : 'in-memory'}. Sample data captured {d.seedCapturedAt.slice(0, 10)}. Alpha Vantage budget: {d.alphaVantageBudget.remaining}{' '}
        of {d.alphaVantageBudget.limit} requests left today (resets {fmtAsOf(d.alphaVantageBudget.resetsAt)}).
      </p>
      {msgs.map((m) => (
        <p key={m.text} className="text-[13px] text-warning">
          {m.text}
        </p>
      ))}
      <Table aria-label="Data providers">
        <THead>
          <TR>
            <TH>Provider</TH>
            <TH>Used for</TH>
            <TH>Configured</TH>
            <TH>Status</TH>
            <TH>Last success</TH>
          </TR>
        </THead>
        <TBody>
          {d.providers.map((p) => (
            <TR key={p.name}>
              <TD className="font-medium">{providerLabel(p.name)}</TD>
              <TD className="text-muted-foreground">{ROLE[p.name.toLowerCase()] ?? ''}</TD>
              <TD>{p.configured ? 'Yes' : 'No key'}</TD>
              <TD>
                {!p.configured ? (
                  <Badge>Not in use</Badge>
                ) : p.circuit === 'closed' ? (
                  <Badge tone="success">Available</Badge>
                ) : p.circuit === 'half-open' ? (
                  <Badge tone="warning">Recovering</Badge>
                ) : (
                  <Badge tone="danger">Unavailable</Badge>
                )}
                {p.lastError ? <span className="ml-2 text-xs text-muted-foreground">{p.lastError}</span> : null}
              </TD>
              <TD className="num text-muted-foreground">{p.lastSuccessAt ? fmtAsOf(p.lastSuccessAt) : 'none yet'}</TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </div>
  );
}
