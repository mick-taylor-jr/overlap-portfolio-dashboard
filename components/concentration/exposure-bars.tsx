'use client';

import { useState } from 'react';
import { UNRESOLVED } from '@/lib/types';
import type { Exposure, LookThroughResult } from '@/lib/finance';
import { fmtPct, fmtPctBound } from '@/lib/format';
import { ChartFrame } from '@/components/shared/chart-frame';
import { CoverageNote } from '@/components/shared/coverage-note';
import { Switch } from '@/components/ui/switch';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { Tooltip } from '@/components/ui/tooltip';
import { Segmented } from '@/components/ui/tabs';
import { Sym } from '@/components/shared/symbol';
import { OTHER_LABEL, type ComponentColors } from './colors';
import { Swatch } from './swatch';

/** Top look-through exposures; each bar stacked by the portfolio component that contributes it. */
export function ExposureBars({
  result,
  coverage,
  colors,
  groupByIssuer,
  onGroupByIssuer,
}: {
  result: LookThroughResult;
  coverage: number | null;
  colors: ComponentColors;
  groupByIssuer: boolean;
  onGroupByIssuer: (v: boolean) => void;
}) {
  const [topN, setTopN] = useState<'10' | '20' | '40'>('10');
  const resolved = result.exposures.filter((e) => e.key !== UNRESOLVED);
  const unresolved: Exposure = result.exposures.find((e) => e.key === UNRESOLVED) ?? { key: UNRESOLVED, name: UNRESOLVED, weight: 0, contributions: [] };
  const shown = resolved.slice(0, Number(topN));
  const rest = resolved.slice(Number(topN));
  const restWeight = rest.reduce((s, e) => s + e.weight, 0);
  const lb = coverage !== null && coverage < 0.9995;
  // Scale to the largest named holding so small names stay legible. A larger Unresolved bar is
  // drawn truncated with a visible break and its full value printed beside it.
  const max = Math.max(...shown.map((e) => e.weight), 0.0001);

  const chart = (
    <div className="flex flex-col gap-3">
      <Legend colors={colors} />
      <ol className="flex flex-col" aria-label={`Top ${shown.length} look-through exposures`}>
        {shown.map((e) => (
          <BarRow key={e.key} e={e} max={max} colors={colors} lb={lb} />
        ))}
        <BarRow e={unresolved} max={max} colors={colors} lb={false} unresolved />
      </ol>
      {rest.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          {rest.length.toLocaleString('en-US')} more {rest.length === 1 ? 'name' : 'names'} make up {fmtPct(restWeight)} of the portfolio.
        </p>
      ) : null}
    </div>
  );

  const table = (
    <Table aria-label="Look-through exposures">
      <THead>
        <TR>
          <TH>Holding</TH>
          <TH numeric>Weight</TH>
          <TH>Contributed by</TH>
        </TR>
      </THead>
      <TBody>
        {[...shown, unresolved].map((e) => (
          <TR key={e.key}>
            <TD>
              {e.key === UNRESOLVED ? UNRESOLVED : <Sym>{e.key}</Sym>}
              {e.name && e.name !== e.key && e.key !== UNRESOLVED ? <span className="ml-2 text-xs text-muted-foreground">{e.name}</span> : null}
            </TD>
            <TD numeric>{e.key === UNRESOLVED ? fmtPct(e.weight) : fmtPctBound(e.weight, lb)}</TD>
            <TD className="text-xs text-muted-foreground">{e.contributions.map((c) => `${c.from} ${fmtPct(c.weight, 2)}`).join(', ') || 'none'}</TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );

  return (
    <ChartFrame
      title="Top look-through exposures"
      description="Each bar is one company's share of your whole portfolio, split by the position it comes through."
      coverage={<CoverageNote coverage={coverage} what="exposures" />}
      actions={
        <Segmented
          label="Number of holdings shown"
          value={topN}
          onValueChange={setTopN}
          options={[
            { value: '10', label: 'Top 10' },
            { value: '20', label: '20' },
            { value: '40', label: '40' },
          ]}
        />
      }
      chart={chart}
      table={table}
      footer={<Switch id="group-issuer" checked={groupByIssuer} onCheckedChange={onGroupByIssuer} label="Group share classes by issuer (GOOG + GOOGL, BRK.A + BRK.B)" />}
    />
  );
}

function Legend({ colors }: { colors: ComponentColors }) {
  return (
    <ul className="flex flex-wrap gap-x-3.5 gap-y-1 text-xs text-muted-foreground" aria-label="Legend: contributing positions">
      {colors.legend.map((l) => (
        <li key={l.symbol} className="inline-flex items-center gap-1.5">
          <Swatch color={l.color} />
          <span className="font-mono text-[11.5px]">{l.symbol}</span>
        </li>
      ))}
      {colors.hasOther ? (
        <li className="inline-flex items-center gap-1.5">
          <Swatch color="var(--chart-other)" />
          {OTHER_LABEL}
        </li>
      ) : null}
      <li className="inline-flex items-center gap-1.5">
        <Swatch hatched />
        Not disclosed
      </li>
    </ul>
  );
}

function BarRow({ e, max, colors, lb, unresolved }: { e: Exposure; max: number; colors: ComponentColors; lb: boolean; unresolved?: boolean }) {
  const label = unresolved ? UNRESOLVED : e.key;
  const value = unresolved ? fmtPct(e.weight) : fmtPctBound(e.weight, lb);
  const desc = e.contributions.length
    ? e.contributions.map((c) => `${c.from} ${fmtPct(c.weight, 2)}`).join(', ')
    : 'No undisclosed weight';
  return (
    <li className="grid grid-cols-[minmax(0,9.5rem)_1fr_4.25rem] items-center gap-3 py-[5px] sm:grid-cols-[minmax(0,13rem)_1fr_4.5rem]">
      <span className="min-w-0 truncate text-[13px]" title={e.name && e.name !== e.key ? `${e.key}, ${e.name}` : label}>
        {unresolved ? (
          <span className="text-muted-foreground">{UNRESOLVED}</span>
        ) : (
          <>
            <Sym>{e.key}</Sym>
            {e.name && e.name !== e.key ? <span className="ml-1.5 text-xs text-muted-foreground">{e.name}</span> : null}
          </>
        )}
      </span>
      <Tooltip
        className="block h-4 w-full"
        content={
          <span className="flex flex-col gap-0.5">
            <span className="font-medium">
              {label}: {value}
            </span>
            {e.contributions.map((c) => (
              <span key={c.from} className="num flex justify-between gap-4">
                <span>{unresolved ? `${c.from} (not disclosed)` : `via ${c.from}`}</span>
                <span>{fmtPct(c.weight, 2)}</span>
              </span>
            ))}
          </span>
        }
      >
        <span tabIndex={0} role="img" aria-label={`${label}: ${value}. ${desc}`} className="relative flex h-4 w-full gap-[2px] overflow-hidden rounded-sm">
          {e.contributions.map((c, i) => (
            <span
              key={c.from}
              className={`h-full shrink-0 ${unresolved ? 'fill-unresolved' : ''} ${i === e.contributions.length - 1 ? 'rounded-r-[4px]' : ''}`}
              style={{ width: `${(c.weight / max) * 100}%`, background: unresolved ? undefined : colors.colorOf(c.from), minWidth: c.weight > 0 ? 1 : 0 }}
            />
          ))}
          {e.weight > max * 1.0001 ? (
            <span aria-hidden title="Bar truncated: longer than the scale" className="absolute inset-y-0 right-3 w-1.5 -skew-x-12 bg-card" />
          ) : null}
        </span>
      </Tooltip>
      <span className="num text-right text-[13px] tabular-nums">{value}</span>
    </li>
  );
}
