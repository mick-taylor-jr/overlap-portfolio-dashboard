'use client';

import { Link2, Plus, X } from 'lucide-react';
import type { UiSchedule } from '@/lib/portfolio/state';
import { newId } from '@/lib/portfolio/state';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { NumberField } from '@/components/shared/number-field';
import { AdvisoryEditor } from '@/components/fees/advisory-editor';
import { SCHEDULE_COLORS } from './schedule-chart';
import { ADVISOR_EXAMPLE_ID } from './schedule-math';
import { Swatch } from '@/components/concentration/swatch';

export function ScheduleEditor({
  schedules,
  resolved,
  balance,
  onChange,
}: {
  schedules: UiSchedule[];
  /** Schedules after linking "Current" to the portfolio (what the outputs use). */
  resolved: UiSchedule[];
  balance: number;
  onChange: (s: UiSchedule[]) => void;
}) {
  const edit = (i: number, patch: Partial<UiSchedule>) =>
    onChange(schedules.map((s, j) => (j === i ? { ...resolved[i], ...patch, linked: false } : s)));

  return (
    <div className="grid items-start gap-3 md:grid-cols-[repeat(2,minmax(0,1fr))]">
      {resolved.map((s, i) => (
        <fieldset key={s.id} className="flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-card p-4">
          <legend className="sr-only">Schedule {i + 1}</legend>
          <div className="flex items-start gap-2">
            <span className="mt-3">
              <Swatch color={SCHEDULE_COLORS[i]} />
            </span>
            <label className="min-w-0 flex-1">
              <span className="sr-only">Schedule {i + 1} name</span>
              <Input value={s.name} onChange={(e) => edit(i, { name: e.target.value })} className="font-medium" />
            </label>
            <Button variant="ghost" size="icon" aria-label={`Remove ${s.name}`} disabled={schedules.length <= 2} onClick={() => onChange(schedules.filter((_, j) => j !== i))}>
              <X aria-hidden />
            </Button>
          </div>
          {schedules[i].linked && s.id === ADVISOR_EXAMPLE_ID ? (
            <Badge className="self-start" title="Not your portfolio: your funds plus a hypothetical flat 1% advisory fee, for comparison.">
              Example: your funds + a 1% advisor
            </Badge>
          ) : schedules[i].linked ? (
            <Badge tone="primary" className="self-start">
              <Link2 className="size-3" aria-hidden /> Following your portfolio
            </Badge>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            <NumberField label="Fund expense ratio" kind="percent" value={s.fundRate} min={0} max={0.1} onChange={(v) => v !== null && edit(i, { fundRate: v })} />
            <NumberField
              label="Other recurring"
              kind="percent"
              value={s.otherRecurringRate ?? 0}
              min={0}
              max={0.1}
              onChange={(v) => v !== null && edit(i, { otherRecurringRate: v || undefined })}
            />
          </div>
          <AdvisoryEditor idPrefix={`sched-${s.id}`} fee={s.advisory} aum={balance} onChange={(f) => edit(i, { advisory: f })} />
        </fieldset>
      ))}
      {schedules.length < 4 ? (
        <button
          type="button"
          onClick={() => onChange([...schedules, { id: newId(), name: `Schedule ${schedules.length + 1}`, fundRate: 0.001 }])}
          className="flex min-h-32 items-center justify-center gap-2 rounded-lg border border-dashed border-border text-[13px] text-muted-foreground hover:bg-muted"
        >
          <Plus className="size-4" aria-hidden /> Add a schedule
        </button>
      ) : null}
    </div>
  );
}
