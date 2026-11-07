'use client';

import { UNRESOLVED, type Provenance } from '@/lib/types';
import type { LookThroughResult } from '@/lib/finance';
import { fmtPct, fmtPctBound } from '@/lib/format';
import { ChartFrame } from '@/components/shared/chart-frame';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { SourceBadge } from '@/components/source-badge';
import { NON_EQUITY_SECTOR } from '@/lib/hooks/normalize-bridge';
import { Swatch } from './swatch';

/** Sector exposure (single series, slot 1) with an optional broad-market reference tick. */
export function SectorChart({
  result,
  reference,
  referenceSource,
  referenceLabel,
}: {
  result: LookThroughResult;
  reference: Record<string, number> | null;
  referenceSource: Provenance | null;
  referenceLabel: string;
}) {
  const unresolved = result.exposures.find((e) => e.key === UNRESOLVED);
  const nonEquity = result.exposures.find((e) => e.key === NON_EQUITY_SECTOR);
  const sectors = result.exposures.filter((e) => e.key !== UNRESOLVED && e.key !== NON_EQUITY_SECTOR);
  const unresolvedWeight = unresolved?.weight ?? 0;
  const lb = unresolvedWeight > 0.0005;
  const refKeys = reference ? Object.keys(reference).filter((k) => !sectors.some((s) => s.key === k)) : [];
  const rows = [
    ...sectors.map((s) => ({ key: s.key, weight: s.weight, ref: reference?.[s.key] ?? null })),
    ...refKeys.map((k) => ({ key: k, weight: 0, ref: reference?.[k] ?? null })),
  ];
  const max = Math.max(...rows.map((r) => Math.max(r.weight, r.ref ?? 0)), unresolvedWeight, nonEquity?.weight ?? 0, 0.0001);
  const coverage = 1 - unresolvedWeight;

  const chart = (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Legend">
        <li className="inline-flex items-center gap-1.5">
          <Swatch color="var(--chart-1)" /> Your portfolio
        </li>
        {reference ? (
          <li className="inline-flex items-center gap-1.5">
            <span aria-hidden className="inline-block h-3 w-[2px] bg-foreground" /> {referenceLabel}
          </li>
        ) : null}
        <li className="inline-flex items-center gap-1.5">
          <Swatch hatched /> Not disclosed
        </li>
      </ul>
      <ol className="flex flex-col">
        {rows.map((r) => (
          <SectorRow key={r.key} label={r.key} weight={r.weight} refWeight={r.ref} max={max} lb={lb} />
        ))}
        {nonEquity ? <SectorRow label={NON_EQUITY_SECTOR} weight={nonEquity.weight} refWeight={null} max={max} lb={false} muted /> : null}
        <SectorRow label={UNRESOLVED} weight={unresolvedWeight} refWeight={null} max={max} lb={false} hatched />
      </ol>
      {reference && referenceSource ? (
        <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          Reference: {referenceLabel} sector weights <SourceBadge p={referenceSource} />
        </p>
      ) : null}
    </div>
  );

  const table = (
    <Table aria-label="Sector exposure">
      <THead>
        <TR>
          <TH>Sector</TH>
          <TH numeric>Your portfolio</TH>
          {reference ? <TH numeric>{referenceLabel}</TH> : null}
        </TR>
      </THead>
      <TBody>
        {rows.map((r) => (
          <TR key={r.key}>
            <TD>{r.key}</TD>
            <TD numeric>{fmtPctBound(r.weight, lb)}</TD>
            {reference ? <TD numeric>{fmtPct(r.ref)}</TD> : null}
          </TR>
        ))}
        {nonEquity ? (
          <TR>
            <TD>{NON_EQUITY_SECTOR}</TD>
            <TD numeric>{fmtPct(nonEquity.weight)}</TD>
            {reference ? <TD /> : null}
          </TR>
        ) : null}
        <TR>
          <TD>{UNRESOLVED}</TD>
          <TD numeric>{fmtPct(unresolvedWeight)}</TD>
          {reference ? <TD /> : null}
        </TR>
      </TBody>
    </Table>
  );

  return (
    <ChartFrame
      title="Sector exposure"
      description="GICS sectors across everything you hold, looked through each fund."
      coverage={
        <p className={`text-xs ${coverage < 0.9995 ? 'text-warning' : 'text-muted-foreground'}`}>
          Sector data coverage {fmtPct(coverage, 0)}
          {coverage < 0.9995 ? ': sector weights are lower bounds.' : '.'}
        </p>
      }
      chart={chart}
      table={table}
    />
  );
}

function SectorRow({ label, weight, refWeight, max, lb, hatched, muted }: { label: string; weight: number; refWeight: number | null; max: number; lb: boolean; hatched?: boolean; muted?: boolean }) {
  const value = fmtPctBound(weight, lb);
  return (
    <li className="grid grid-cols-[minmax(0,10rem)_1fr_4.5rem] items-center gap-3 py-[5px] sm:grid-cols-[minmax(0,12rem)_1fr_4.5rem]">
      <span className={`truncate text-[13px] ${hatched || muted ? 'text-muted-foreground' : ''}`} title={label}>
        {label}
      </span>
      <span
        className="relative block h-4"
        role="img"
        aria-label={`${label}: ${value}${refWeight !== null ? `; reference ${fmtPct(refWeight)}` : ''}`}
      >
        <span
          className={`absolute inset-y-0 left-0 rounded-r-[4px] ${hatched ? 'fill-unresolved' : ''}`}
          style={{ width: `${(weight / max) * 100}%`, background: hatched ? undefined : muted ? 'var(--chart-other)' : 'var(--chart-1)' }}
        />
        {refWeight !== null ? (
          <span
            aria-hidden
            className="absolute -inset-y-0.5 w-[2px] rounded bg-foreground ring-2 ring-card"
            style={{ left: `calc(${(refWeight / max) * 100}% - 1px)` }}
            title={`Reference ${fmtPct(refWeight)}`}
          />
        ) : null}
      </span>
      <span className="num text-right text-[13px] tabular-nums">{value}</span>
    </li>
  );
}
