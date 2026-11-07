import type { Analysis } from '@/lib/hooks/use-portfolio-analysis';
import type { FlagThresholds } from '@/lib/types';
import { fmtPct, fmtPctBound } from '@/lib/format';

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

/** "You own 6 funds but effectively 41 distinct companies; effective N is 17." */
export function naiveVsLookThrough(a: Analysis): string | null {
  if (!a.metrics) return null;
  const { funds, stocks, crypto, cash } = a.counts;
  const parts: string[] = [];
  if (funds) parts.push(plural(funds, 'fund', 'funds'));
  if (stocks) parts.push(plural(stocks, 'stock', 'stocks'));
  if (crypto) parts.push(plural(crypto, 'crypto asset', 'crypto assets'));
  if (cash) parts.push('cash');
  const owned = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : (parts[0] ?? 'nothing');
  const n = a.metrics.effectiveN;
  const distinct = a.metrics.distinctCount;
  const what = stocks || funds ? (distinct === 1 ? 'distinct holding' : 'distinct holdings') : 'distinct assets';
  const lowerBound = a.coverage !== null && a.coverage < 0.9995;
  return `You own ${owned} but effectively ${lowerBound ? 'at least ' : ''}${distinct.toLocaleString('en-US')} ${what}; effective N is ${n === null ? 'unknown' : n >= 100 ? Math.round(n).toLocaleString('en-US') : n.toFixed(n < 10 ? 1 : 0)}.`;
}

export function Headline({ analysis, thresholds }: { analysis: Analysis; thresholds: FlagThresholds }) {
  const m = analysis.metrics;
  const sentence = naiveVsLookThrough(analysis);
  const lb = analysis.coverage !== null && analysis.coverage < 0.9995;
  const resolved = analysis.exposures?.exposures.filter((e) => e.contributions.length > 0 && e.key !== 'Unresolved / not disclosed') ?? [];
  const largest = resolved[0];
  const pairs = analysis.overlaps.filter((o) => o.overlap > thresholds.pairOverlap);
  const pairsLb = pairs.some((p) => p.lowerBound);
  const fundPairs = (analysis.funds.length * (analysis.funds.length - 1)) / 2;

  return (
    <section aria-label="Concentration summary" className="flex flex-col gap-5">
      {sentence ? (
        <p className="max-w-[46ch] text-[22px] font-medium leading-[1.3] tracking-[-0.015em] sm:text-[28px]" data-testid="naive-sentence">
          {sentence}
        </p>
      ) : null}
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border lg:grid-cols-4">
        <Stat
          label="Effective number of holdings"
          value={m?.effectiveN != null ? m.effectiveN.toFixed(m.effectiveN < 10 ? 1 : 0) : 'unknown'}
          note="1 / HHI on resolved exposures"
        />
        <Stat label="Top-10 share" value={m ? fmtPctBound(m.top10, lb) : 'unknown'} note={m ? `Top 1: ${fmtPct(m.top1)}. Top 5: ${fmtPct(m.top5)}.` : undefined} />
        <Stat
          label="Largest single name"
          value={largest ? fmtPctBound(largest.weight, lb) : 'none'}
          note={largest ? (largest.name && largest.name !== largest.key ? `${largest.key}, ${largest.name}` : largest.key) : undefined}
        />
        <Stat
          label={`Fund pairs overlapping above ${fmtPct(thresholds.pairOverlap, 0)}`}
          value={fundPairs > 0 ? `${pairs.length}` : 'n/a'}
          note={fundPairs > 0 ? `of ${fundPairs} ${fundPairs === 1 ? 'pair' : 'pairs'}${pairsLb ? ', lower bounds' : ''}` : 'Needs two funds with holdings data'}
        />
      </dl>
    </section>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex flex-col gap-1 bg-card px-4 py-3.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-[26px] font-semibold leading-none tracking-tight">{value}</dd>
      {note ? <dd className="truncate text-xs text-muted-foreground" title={note}>{note}</dd> : null}
    </div>
  );
}
