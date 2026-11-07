'use client';

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from 'recharts';
import type { FeeDragResult } from '@/lib/finance';
import { fmtUsd, fmtUsdCompact } from '@/lib/format';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';

const GROSS = 'var(--chart-other)';
const NET = 'var(--chart-1)';

interface Pt {
  year: number;
  gross: number;
  net: number;
}

function TooltipBody({ active, payload }: TooltipContentProps) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload as Pt;
  return (
    <div className="num rounded-md border border-border bg-card px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium">Year {p.year}</p>
      <p className="flex justify-between gap-6">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-3" style={{ background: GROSS }} /> Without fees
        </span>
        {fmtUsd(p.gross)}
      </p>
      <p className="flex justify-between gap-6">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-3" style={{ background: NET }} /> With fees
        </span>
        {fmtUsd(p.net)}
      </p>
      <p className="mt-1 flex justify-between gap-6 text-muted-foreground">
        <span>Lost to fees</span>
        {fmtUsd(p.gross - p.net)}
      </p>
    </div>
  );
}

export function GrowthChart({ result }: { result: FeeDragResult }) {
  const data: Pt[] = result.grossPath.map((g, i) => ({ year: i, gross: g, net: result.netPath[i] }));
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-wrap gap-x-4 text-xs text-muted-foreground" aria-label="Legend">
        <li className="inline-flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-0.5 w-4" style={{ background: GROSS }} /> Without fees (gross return)
        </li>
        <li className="inline-flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-0.5 w-4" style={{ background: NET }} /> With fees (gross minus fees)
        </li>
      </ul>
      <div className="h-64 w-full" role="img" aria-label={`Growth with and without fees over ${data.length - 1} years: ending ${fmtUsd(result.grossFV)} without fees and ${fmtUsd(result.netFV)} with fees.`}>
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 600, height: 256 }}>
          <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="year" tickLine={false} axisLine={false} tickMargin={6} interval="preserveStartEnd" />
            <YAxis tickFormatter={(v: number) => fmtUsdCompact(v)} tickLine={false} axisLine={false} width={56} />
            <Tooltip content={TooltipBody} cursor={{ stroke: 'var(--border)' }} />
            <Line type="monotone" dataKey="gross" stroke={GROSS} strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="net" stroke={NET} strokeWidth={2} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function GrowthTable({ result }: { result: FeeDragResult }) {
  const T = result.grossPath.length - 1;
  const years = [...new Set([0, 1, 5, 10, 15, 20, 25, 30, 40, 50, T])].filter((y) => y <= T).sort((a, b) => a - b);
  return (
    <Table aria-label="Growth with and without fees">
      <THead>
        <TR>
          <TH numeric>Year</TH>
          <TH numeric>Without fees</TH>
          <TH numeric>With fees</TH>
          <TH numeric>Lost to fees</TH>
        </TR>
      </THead>
      <TBody>
        {years.map((y) => (
          <TR key={y}>
            <TD numeric>{y}</TD>
            <TD numeric>{fmtUsd(result.grossPath[y])}</TD>
            <TD numeric>{fmtUsd(result.netPath[y])}</TD>
            <TD numeric>{fmtUsd(result.grossPath[y] - result.netPath[y])}</TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
