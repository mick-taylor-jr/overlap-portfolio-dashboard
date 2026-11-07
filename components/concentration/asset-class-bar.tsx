'use client';

import { UNRESOLVED } from '@/lib/types';
import type { LookThroughResult } from '@/lib/finance';
import { fmtPct } from '@/lib/format';
import { ChartFrame } from '@/components/shared/chart-frame';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { Swatch } from './swatch';

/** Asset classes are a fixed set, so each gets a fixed slot (never by rank). */
const CLASS_COLOR: Record<string, string> = {
  Stocks: 'var(--chart-1)',
  Bonds: 'var(--chart-2)',
  Cash: 'var(--chart-3)',
  Crypto: 'var(--chart-7)',
  Other: 'var(--chart-other)',
};
/** Ink inside a fill is chosen by the fill's luminance, the same in both modes. */
const CLASS_INK: Record<string, string> = { Stocks: '#ffffff', Bonds: '#16181d', Cash: '#16181d', Crypto: '#ffffff', Other: '#16181d' };

/** One whole split into parts: a tall segmented bar with the share printed inside when it fits. */
export function AssetClassBar({ result }: { result: LookThroughResult }) {
  const parts = result.exposures.filter((e) => e.weight > 0.00005);
  const unresolved = parts.find((p) => p.key === UNRESOLVED);
  const chart = (
    <div className="flex flex-col gap-3">
      <div className="flex h-7 w-full gap-[2px]" role="img" aria-label={parts.map((p) => `${p.key} ${fmtPct(p.weight)}`).join(', ')}>
        {parts.map((p) => {
          const hatched = p.key === UNRESOLVED;
          return (
            <span
              key={p.key}
              title={`${p.key}: ${fmtPct(p.weight)}`}
              className={`flex h-full items-center overflow-hidden rounded-[4px] px-1.5 text-[11px] font-medium ${hatched ? 'fill-unresolved text-foreground' : ''}`}
              style={{
                width: `${p.weight * 100}%`,
                background: hatched ? undefined : (CLASS_COLOR[p.key] ?? 'var(--chart-other)'),
                color: hatched ? undefined : (CLASS_INK[p.key] ?? '#16181d'),
              }}
            >
              {p.weight >= 0.08 ? <span className="num">{fmtPct(p.weight, 0)}</span> : null}
            </span>
          );
        })}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {parts.map((p) => (
          <li key={p.key} className="inline-flex items-center gap-1.5">
            <Swatch color={CLASS_COLOR[p.key] ?? 'var(--chart-other)'} hatched={p.key === UNRESOLVED} />
            {p.key === UNRESOLVED ? 'Not disclosed' : p.key}
          </li>
        ))}
      </ul>
    </div>
  );
  const table = (
    <Table aria-label="Asset class breakdown">
      <THead>
        <TR>
          <TH>Asset class</TH>
          <TH numeric>Weight</TH>
        </TR>
      </THead>
      <TBody>
        {parts.map((p) => (
          <TR key={p.key}>
            <TD>{p.key}</TD>
            <TD numeric>{fmtPct(p.weight)}</TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
  return (
    <ChartFrame
      title="Asset classes"
      description="Funds are split by their reported asset allocation. Equity funds that report sector weights but no allocation count as stocks."
      coverage={
        unresolved ? (
          <p className="text-xs text-warning">{fmtPct(unresolved.weight, 0)} of value sits in funds without a reported allocation.</p>
        ) : (
          <p className="text-xs text-muted-foreground">Allocation data coverage 100%.</p>
        )
      }
      chart={chart}
      table={table}
    />
  );
}
