'use client';

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from 'recharts';
import type { ScheduleComparisonPoint } from '@/lib/finance';
import type { UiSchedule } from '@/lib/portfolio/state';
import { fmtPct, fmtUsd, fmtUsdCompact } from '@/lib/format';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';

export const SCHEDULE_COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)'];

type Row = { r: number } & Record<string, number>;

function toRows(points: ScheduleComparisonPoint[], T: number): Row[] {
  return points
    .filter((p) => p.T === T)
    .map((p) => ({ r: p.r, ...p.ending }) as Row)
    .sort((a, b) => a.r - b.r);
}

/** Ending balance after T years across a range of identical gross returns, one line per schedule. */
export function ScheduleChart({ points, schedules, T }: { points: ScheduleComparisonPoint[]; schedules: UiSchedule[]; T: number }) {
  const rows = toRows(points, T);
  const TooltipBody = ({ active, payload }: TooltipContentProps) => {
    if (!active || !payload?.length) return null;
    const row = payload[0].payload as Row;
    return (
      <div className="num rounded-md border border-border bg-card px-3 py-2 text-xs shadow-md">
        <p className="mb-1 font-medium">Gross return {fmtPct(row.r, 1)}</p>
        {schedules.map((s, i) => (
          <p key={s.id} className="flex justify-between gap-6">
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-3" style={{ background: SCHEDULE_COLORS[i] }} />
              {s.name}
            </span>
            {fmtUsd(row[s.id])}
          </p>
        ))}
      </div>
    );
  };
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Legend">
        {schedules.map((s, i) => (
          <li key={s.id} className="inline-flex items-center gap-1.5">
            <span aria-hidden className="inline-block h-0.5 w-4" style={{ background: SCHEDULE_COLORS[i] }} />
            {s.name}
          </li>
        ))}
      </ul>
      <div className="h-72 w-full" role="img" aria-label={`Ending balance after ${T} years by gross return, one line per fee schedule.`}>
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 600, height: 288 }}>
          <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="r" type="number" domain={['dataMin', 'dataMax']} ticks={[0, 0.02, 0.04, 0.06, 0.08, 0.1]} tickFormatter={(v: number) => fmtPct(v, 0)} tickLine={false} axisLine={false} tickMargin={6} />
            <YAxis tickFormatter={(v: number) => fmtUsdCompact(v)} tickLine={false} axisLine={false} width={56} />
            <Tooltip content={TooltipBody} cursor={{ stroke: 'var(--border)' }} />
            {schedules.map((s, i) => (
              <Line key={s.id} type="monotone" dataKey={s.id} name={s.name} stroke={SCHEDULE_COLORS[i]} strokeWidth={2} dot={false} isAnimationActive={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="text-xs text-muted-foreground">Gross return assumption (same for every schedule), on the horizontal axis.</p>
    </div>
  );
}

export function ScheduleTable({ points, schedules, T }: { points: ScheduleComparisonPoint[]; schedules: UiSchedule[]; T: number }) {
  const rows = toRows(points, T).filter((r) => Math.round(r.r * 1000) % 10 === 0);
  return (
    <Table aria-label={`Ending balance after ${T} years by gross return`}>
      <THead>
        <TR>
          <TH numeric>Gross return</TH>
          {schedules.map((s) => (
            <TH key={s.id} numeric>
              {s.name}
            </TH>
          ))}
        </TR>
      </THead>
      <TBody>
        {rows.map((r) => (
          <TR key={r.r}>
            <TD numeric>{fmtPct(r.r, 0)}</TD>
            {schedules.map((s) => (
              <TD key={s.id} numeric>
                {fmtUsd(r[s.id])}
              </TD>
            ))}
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
