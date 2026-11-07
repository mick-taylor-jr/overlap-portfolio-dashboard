'use client';

import { useState } from 'react';
import { FlaskConical, Layers } from 'lucide-react';
import { usePortfolio } from '@/lib/portfolio/context';
import { cn } from '@/components/ui/cn';
import { Sym } from '@/components/shared/symbol';
import { getSamples, loadStarterPack, STARTER_PACK_AVAILABLE } from './samples-source';

/** One click to a populated dashboard. Prominent when the portfolio is empty, compact otherwise. */
export function SampleGallery({ prominent, onLoaded }: { prominent: boolean; onLoaded?: () => void }) {
  const { loadPortfolio, notify } = usePortfolio();
  const [busy, setBusy] = useState(false);
  const samples = getSamples();

  const loadStarter = async () => {
    setBusy(true);
    try {
      const r = await loadStarterPack();
      loadPortfolio(
        r.portfolio,
        `Loaded the starter pack sample: ${r.portfolio.positions.length} synthetic positions across accounts. Every security in it is synthetic, not a real company.${r.skipped ? ` ${r.skipped} rows were skipped (${r.firstError}).` : ''}`,
      );
      onLoaded?.();
    } catch (e) {
      notify('danger', e instanceof Error ? e.message : 'The starter pack sample could not be loaded.');
    } finally {
      setBusy(false);
    }
  };

  if (!prominent) {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
        <span className="text-muted-foreground">Try a sample:</span>
        {samples.map((s) => (
          <button
            key={s.id}
            type="button"
            className="text-primary underline-offset-4 hover:underline"
            onClick={() => {
              loadPortfolio(structuredClone(s.portfolio), `Loaded the sample "${s.name}". Amounts are illustrative.`);
              onLoaded?.();
            }}
          >
            {s.name}
          </button>
        ))}
        {STARTER_PACK_AVAILABLE ? (
          <button type="button" className="text-primary underline-offset-4 hover:underline" onClick={loadStarter} disabled={busy}>
            Starter pack sample (synthetic)
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <section aria-labelledby="samples-heading" className="flex flex-col gap-4">
      <div>
        <h2 id="samples-heading" className="text-xl font-semibold tracking-tight sm:text-2xl">
          See what your funds really hold
        </h2>
        <p className="mt-1 max-w-[62ch] text-[14px] text-muted-foreground">
          Load a sample to see look-through concentration, fund overlap and fees in dollars, or add your own positions below. Everything stays in this
          browser; only ticker symbols are sent to look up prices.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {samples.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => {
              loadPortfolio(structuredClone(s.portfolio), `Loaded the sample "${s.name}". Amounts are illustrative.`);
              onLoaded?.();
            }}
            className="group flex flex-col items-start gap-2 rounded-lg border border-border bg-card p-4 text-left transition-colors hover:border-primary/50 hover:bg-accent/40"
          >
            <Layers className="size-4 text-primary" aria-hidden />
            <span className="text-[14px] font-semibold leading-snug">{s.name}</span>
            <span className="text-[13px] leading-snug text-muted-foreground">{s.description}</span>
            <span className="mt-auto flex flex-wrap gap-1 pt-1">
              {s.portfolio.positions.slice(0, 6).map((p) => (
                <Sym key={p.id} className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                  {p.symbol}
                </Sym>
              ))}
            </span>
          </button>
        ))}
        {STARTER_PACK_AVAILABLE ? (
          <button
            type="button"
            onClick={loadStarter}
            disabled={busy}
            className={cn(
              'flex flex-col items-start gap-2 rounded-lg border border-dashed border-warning/50 bg-card p-4 text-left transition-colors hover:bg-warning-bg/50',
              busy && 'opacity-60',
            )}
          >
            <FlaskConical className="size-4 text-warning" aria-hidden />
            <span className="text-[14px] font-semibold leading-snug">Starter pack sample (synthetic)</span>
            <span className="text-[13px] leading-snug text-muted-foreground">
              120 synthetic positions across 6 accounts, with sectors and fees. Not real securities.
            </span>
          </button>
        ) : null}
      </div>
    </section>
  );
}
