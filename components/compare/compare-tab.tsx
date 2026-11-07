'use client';

import { useMemo, useState } from 'react';
import { compareSchedules, lumpSumRatio } from '@/lib/finance';
import type { Analysis } from '@/lib/hooks/use-portfolio-analysis';
import { usePortfolio } from '@/lib/portfolio/context';
import { SHARE_NOTIONAL, type CompareSettings, type UiSchedule } from '@/lib/portfolio/state';
import { fmtPct, fmtRate, fmtUsd } from '@/lib/format';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { NumberField } from '@/components/shared/number-field';
import { Hypothetical } from '@/components/shared/hypothetical';
import { ChartFrame } from '@/components/shared/chart-frame';
import { UnknownRatiosWarning } from '@/components/shared/unknown-ratios';
import { Swatch } from '@/components/concentration/swatch';
import { CONVENTION } from '@/components/fees/fee-drag';
import { ScheduleEditor } from './schedule-editor';
import { SCHEDULE_COLORS, ScheduleChart, ScheduleTable } from './schedule-chart';
import { ADVISOR_EXAMPLE_ID, advisorExample, resolveLinked, scheduleRate } from './schedule-math';

const RANGE = Array.from({ length: 21 }, (_, i) => Math.round(i * 0.005 * 10000) / 10000);

export function CompareTab({ analysis }: { analysis: Analysis }) {
  const { state, dispatch } = usePortfolio();
  const c = state.compare;
  const set = (patch: Partial<Omit<CompareSettings, 'schedules'>>) => dispatch({ type: 'compare', patch });
  const portfolioTotal = analysis.totalValue;
  const P = c.P ?? (portfolioTotal > 0 ? portfolioTotal : SHARE_NOTIONAL);

  const fees = portfolioTotal > 0 ? analysis.fees : null;
  const advisory = state.portfolio.advisoryFee;
  const unknownCount = fees?.unknown.length ?? 0;
  // With no advisory fee on the portfolio, "Current" has no advisor; an extra, clearly labeled
  // example keeps the advisor case in the comparison. It is not stored until the user edits it.
  const [exampleDismissed, setExampleDismissed] = useState(false);
  const currentLinked = c.schedules.some((s) => s.linked && s.id !== ADVISOR_EXAMPLE_ID);
  const showExample = !advisory && currentLinked && !exampleDismissed && c.schedules.length < 4 && !c.schedules.some((s) => s.id === ADVISOR_EXAMPLE_ID);
  const fallbackFundRate = c.schedules.find((s) => s.linked && s.id !== ADVISOR_EXAMPLE_ID)?.fundRate ?? 0.002;
  const stored: UiSchedule[] = useMemo(
    () => (showExample ? [...c.schedules, advisorExample(fees, fallbackFundRate)] : c.schedules),
    [showExample, c.schedules, fees, fallbackFundRate],
  );

  const schedules: UiSchedule[] = useMemo(
    () => stored.map((s) => resolveLinked(s, fees, advisory, P, fallbackFundRate)),
    [stored, fees, advisory, P, fallbackFundRate],
  );

  const onSchedulesChange = (next: UiSchedule[]) => {
    if (showExample && !next.some((s) => s.id === ADVISOR_EXAMPLE_ID)) setExampleDismissed(true);
    dispatch({ type: 'schedules', schedules: next });
  };

  const out = useMemo(() => {
    try {
      const at = compareSchedules(schedules, { P, C: c.C, returns: [c.r], horizons: [c.T] })[0];
      const curve = compareSchedules(schedules, { P, C: c.C, returns: RANGE, horizons: [c.T] });
      const rates = schedules.map((s) => scheduleRate(s, P));
      const hi = rates.indexOf(Math.max(...rates));
      const lo = rates.indexOf(Math.min(...rates));
      const gap = (r: number) => 1 - lumpSumRatio(r, rates[hi], rates[lo], c.T);
      return { at, curve, rates, hi, lo, gapAt: gap(c.r), gap0: gap(0), gap10: gap(0.1), error: null };
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'These schedules cannot be compared.' };
    }
  }, [schedules, P, c.C, c.r, c.T]);

  const best = out.error === null ? Math.max(...schedules.map((s) => out.at.ending[s.id])) : 0;

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Compare fee schedules</CardTitle>
            <CardDescription>Every schedule gets the same starting balance, contributions, horizon and gross return, so the comparison does not depend on a forecast.</CardDescription>
          </div>
          <Hypothetical />
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <fieldset className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <legend className="sr-only">Shared assumptions</legend>
            <div className="flex flex-col gap-1">
              <NumberField label="Starting balance" kind="usd" value={P} min={0} onChange={(v) => v !== null && set({ P: v })} />
              {c.P !== null && portfolioTotal > 0 ? (
                <Button variant="link" size="xs" className="self-start text-[11px]" onClick={() => set({ P: null })}>
                  Use portfolio total
                </Button>
              ) : (
                <span className="text-[11px] text-muted-foreground">{portfolioTotal > 0 ? 'Portfolio total' : 'Example balance'}</span>
              )}
            </div>
            <NumberField label="Yearly contribution (year end)" kind="usd" value={c.C} min={0} onChange={(v) => v !== null && set({ C: v })} />
            <NumberField label="Gross return, same for all" kind="percent" value={c.r} min={-0.5} max={0.5} onChange={(v) => v !== null && set({ r: v })} />
            <NumberField label="Horizon (years)" kind="int" value={c.T} min={1} max={60} onChange={(v) => v !== null && set({ T: v })} />
          </fieldset>
          <p className="text-xs text-muted-foreground">{CONVENTION} Tiered advisory fees are applied to each year&apos;s balance.</p>
          {unknownCount > 0 ? <UnknownRatiosWarning count={unknownCount} /> : null}
          <ScheduleEditor schedules={stored} resolved={schedules} balance={P} onChange={onSchedulesChange} />
        </CardContent>
      </Card>

      {out.error !== null ? (
        <p role="alert" className="rounded-md border border-danger/30 bg-danger-bg px-3 py-2 text-[13px] text-danger">
          {out.error}
        </p>
      ) : (
        <>
          <Card>
            <CardHeader>
              <div>
                <CardTitle>
                  Results at {fmtPct(c.r, 1)} gross for {c.T} years
                </CardTitle>
                <CardDescription>Annual fee in dollars at today&apos;s balance, then ending values under identical returns.</CardDescription>
              </div>
              <Hypothetical />
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <p className="max-w-[70ch] text-[17px] font-medium leading-snug tracking-tight" data-testid="invariant">
                At any identical gross return, {schedules[out.hi].name} ends {fmtPct(out.gapAt, 1)} below {schedules[out.lo].name} after {c.T} years.
              </p>
              <p className="text-xs text-muted-foreground">
                Lump-sum ratio ((1 + r − e₁) / (1 + r − e₂))^T at today&apos;s rates. It varies only mildly with the return: {fmtPct(out.gap0, 1)} at 0% and{' '}
                {fmtPct(out.gap10, 1)} at 10%. Contributions and tiered fees shift it slightly.
              </p>
              <Table aria-label="Schedule comparison">
                <THead>
                  <TR>
                    <TH>Schedule</TH>
                    <TH numeric>All-in rate today</TH>
                    <TH numeric>Annual fee today</TH>
                    <TH numeric>Fees paid over {c.T} yrs</TH>
                    <TH numeric>Ending balance</TH>
                    <TH numeric>Versus lowest-cost</TH>
                  </TR>
                </THead>
                <TBody>
                  {schedules.map((s, i) => {
                    const end = out.at.ending[s.id];
                    return (
                      <TR key={s.id}>
                        <TD>
                          <span className="inline-flex min-w-[11rem] items-center gap-2">
                            <Swatch color={SCHEDULE_COLORS[i]} />
                            {s.name}
                          </span>
                        </TD>
                        <TD numeric>{fmtRate(out.rates[i])}</TD>
                        <TD numeric>{fmtUsd(P * out.rates[i])}</TD>
                        <TD numeric>{fmtUsd(out.at.cumulativeFees[s.id])}</TD>
                        <TD numeric className="font-medium">
                          {fmtUsd(end)}
                        </TD>
                        <TD numeric className={end < best ? 'text-danger' : 'text-muted-foreground'}>
                          {end < best ? `−${fmtUsd(best - end)}` : 'lowest cost'}
                        </TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            </CardContent>
          </Card>
          <ChartFrame
            title={`Ending balance after ${c.T} years, across gross returns`}
            description="The gap between lines is what the fee difference costs at each return. No return is predicted."
            actions={<Hypothetical />}
            chart={<ScheduleChart points={out.curve} schedules={schedules} T={c.T} />}
            table={<ScheduleTable points={out.curve} schedules={schedules} T={c.T} />}
          />
        </>
      )}
    </div>
  );
}

