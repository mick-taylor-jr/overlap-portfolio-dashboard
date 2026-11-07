'use client';

import type { OverlapCell } from '@/lib/finance';
import type { FundCoverage } from '@/lib/hooks/use-portfolio-analysis';
import { fmtPct, fmtPctBound } from '@/lib/format';
import { ChartFrame } from '@/components/shared/chart-frame';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { Sym } from '@/components/shared/symbol';

const STEPS = [0, 0.1, 0.25, 0.5, 0.75];
function bucket(v: number): number {
  let b = 0;
  for (let i = 0; i < STEPS.length; i++) if (v >= STEPS[i] && v > 0) b = i + 1;
  return Math.min(5, b);
}
const LEGEND = ['0%', '< 10%', '10–25%', '25–50%', '50–75%', '≥ 75%'];

/** Pairwise fund overlap, Σ min(h_A,i, h_B,i). Cells read "≥ X%" when either fund's holdings are partial. */
export function OverlapHeatmap({ cells, funds, threshold }: { cells: OverlapCell[]; funds: FundCoverage[]; threshold: number }) {
  const symbols = funds.map((f) => f.symbol);
  const get = (a: string, b: string) => cells.find((c) => (c.a === a && c.b === b) || (c.a === b && c.b === a));
  const minCov = funds.reduce((m, f) => Math.min(m, f.coverage), 1);
  const pairs = cells.filter((c) => c.a !== c.b).sort((x, y) => y.overlap - x.overlap);

  if (symbols.length < 2) {
    return (
      <ChartFrame
        title="Fund overlap"
        description="How much of each pair of funds' holdings is the same, by weight."
        chart={<p className="py-6 text-center text-[13px] text-muted-foreground">Add a second fund with holdings data to compare overlap.</p>}
        table={<p className="py-6 text-center text-[13px] text-muted-foreground">No fund pairs to compare yet.</p>}
      />
    );
  }

  const chart = (
    <div className="flex flex-col gap-3">
      <div className="relative overflow-x-auto">
        <table className="border-separate border-spacing-[2px] text-[12px]" aria-label="Fund overlap matrix">
          <thead>
            <tr>
              <th scope="col">
                <span className="sr-only">Fund</span>
              </th>
              {symbols.map((s) => (
                <th key={s} scope="col" className="px-1 pb-1 text-center font-mono text-[11.5px] font-medium text-muted-foreground">
                  {s}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {symbols.map((a) => (
              <tr key={a}>
                <th scope="row" className="pr-2 text-right font-mono text-[11.5px] font-medium text-muted-foreground">
                  {a}
                </th>
                {symbols.map((b) => {
                  if (a === b)
                    return (
                      <td key={b} className="h-11 min-w-16 rounded-[4px] bg-muted text-center text-[11px] text-muted-foreground" aria-label={`${a} with itself`}>
                        <span aria-hidden>·</span>
                      </td>
                    );
                  const c = get(a, b);
                  const v = c?.overlap ?? 0;
                  const lb = c?.lowerBound ?? false;
                  const k = bucket(v);
                  const over = v > threshold;
                  return (
                    <td
                      key={b}
                      className="num h-11 min-w-16 rounded-[4px] px-1.5 text-center font-medium tabular-nums"
                      style={{
                        background: `var(--heat-${k})`,
                        color: k >= 3 ? 'var(--heat-ink-dark)' : 'var(--heat-ink-light)',
                        outline: over ? '2px solid var(--foreground)' : undefined,
                        outlineOffset: over ? '-2px' : undefined,
                      }}
                      title={`${a} and ${b}: ${fmtPctBound(v, lb).replace('≥ ', 'at least ')} overlap${over ? ' (above your threshold)' : ''}`}
                    >
                      {fmtPctBound(v, lb, 0)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1" aria-label="Color scale">
          {LEGEND.map((l, i) => (
            <span key={l} className="inline-flex flex-col items-center gap-0.5">
              <span aria-hidden className="block h-2.5 w-9 rounded-[2px]" style={{ background: `var(--heat-${i})` }} />
              <span className="text-[10px]">{l}</span>
            </span>
          ))}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="inline-block size-3 rounded-[2px] outline outline-2 -outline-offset-2 outline-foreground" />
          Above your {fmtPct(threshold, 0)} threshold
        </span>
        <span>≥ marks a lower bound from partial holdings.</span>
      </div>
    </div>
  );

  const table = (
    <Table aria-label="Fund overlap pairs">
      <THead>
        <TR>
          <TH>Pair</TH>
          <TH numeric>Overlap</TH>
          <TH>Basis</TH>
        </TR>
      </THead>
      <TBody>
        {pairs.map((c) => (
          <TR key={`${c.a}-${c.b}`}>
            <TD>
              <Sym>{c.a}</Sym> / <Sym>{c.b}</Sym>
            </TD>
            <TD numeric>{fmtPctBound(c.overlap, c.lowerBound)}</TD>
            <TD className="text-xs text-muted-foreground">{c.lowerBound ? 'Lower bound (partial holdings)' : 'Full holdings'}</TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );

  return (
    <ChartFrame
      title="Fund overlap"
      description="Share of holdings two funds have in common, by weight: the sum over securities of the smaller of the two weights."
      coverage={
        <div className="flex flex-col gap-1">
          <p className={`text-xs ${minCov < 0.9995 ? 'text-warning' : 'text-muted-foreground'}`}>
            {minCov < 0.9995
              ? `Holdings coverage as low as ${fmtPct(minCov, 0)}: overlap shown is a lower bound.`
              : 'Holdings coverage 100% for every fund shown.'}
          </p>
          <p className="text-xs text-muted-foreground">
            {funds.map((f) => `${f.symbol} ${fmtPct(f.coverage, 0)}${f.total ? ` (${f.disclosed} of ${f.total.toLocaleString('en-US')} holdings)` : ''}`).join('; ')}
          </p>
        </div>
      }
      chart={chart}
      table={table}
    />
  );
}
