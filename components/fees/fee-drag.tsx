'use client';

import { useMemo, useState } from 'react';
import { feeDrag, sensitivityGrid, type OneTimeCosts } from '@/lib/finance';
import { fmtPct, fmtRate, fmtUsd } from '@/lib/format';
import type { FeeAssumptions } from '@/lib/portfolio/state';
import { SENSITIVITY_HORIZONS, SENSITIVITY_RETURNS } from '@/lib/portfolio/state';
import { usePortfolio } from '@/lib/portfolio/context';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { NumberField } from '@/components/shared/number-field';
import { Hypothetical } from '@/components/shared/hypothetical';
import { ChartFrame } from '@/components/shared/chart-frame';
import { SensitivityGrid } from './sensitivity-grid';
import { GrowthChart, GrowthTable } from './growth-chart';
import { UnknownRatiosWarning } from '@/components/shared/unknown-ratios';

export const CONVENTION = 'Net return = gross return minus fees, compounded annually, contributions at year end.';
export const ONE_TIME_CONVENTION =
  'One-time costs are paid up front: both paths start from the starting value minus one-time costs (floored at $0), and "lost to fees" counts annual fees only.';

/** Fee drag under the user's own assumptions. The grid is the default view; no single "expected" number. */
export function FeeDragCalculator({
  portfolioTotal,
  allInRate,
  unknownCount = 0,
  oneTime = null,
}: {
  portfolioTotal: number;
  allInRate: number | null;
  /** Holdings whose expense ratio is unknown (excluded from allInRate). */
  unknownCount?: number;
  /** One-time costs; optionally subtracted from P. */
  oneTime?: OneTimeCosts | null;
}) {
  const { state, dispatch } = usePortfolio();
  const a = state.feeAssumptions;
  const set = (patch: Partial<FeeAssumptions>) => dispatch({ type: 'feeAssumptions', patch });
  const startValue = a.P ?? portfolioTotal;
  const includeOneTime = !!a.includeOneTime && oneTime !== null;
  const oneTimeTotal = oneTime?.total ?? 0;
  const P = includeOneTime ? Math.max(0, startValue - oneTimeTotal) : startValue;
  // Unknown is never 0: with no portfolio rate and no user rate, the user must enter one.
  const e: number | null = a.e ?? allInRate;
  const [sel, setSel] = useState<{ r: number; T: number }>({ r: a.r, T: a.T });

  const computed = useMemo(() => {
    if (e === null) return { grid: [], single: null, error: null };
    try {
      const grid = sensitivityGrid({ P, C: a.C, e }, SENSITIVITY_RETURNS, SENSITIVITY_HORIZONS);
      const single = feeDrag({ P, C: a.C, e, r: sel.r, T: sel.T });
      return { grid, single, error: null };
    } catch (err) {
      return { grid: [], single: null, error: err instanceof Error ? err.message : 'Invalid inputs' };
    }
  }, [P, a.C, e, sel.r, sel.T]);

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader>
          <div>
            <CardTitle>What fees cost over time</CardTitle>
            <CardDescription>{CONVENTION} Returns are your assumptions, shown across a range rather than as one prediction.</CardDescription>
          </div>
          <Hypothetical />
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <fieldset className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-4">
            <legend className="sr-only">Fee drag assumptions</legend>
            <div className="flex flex-col gap-1">
              <NumberField label="Starting value" kind="usd" value={startValue} min={0} onChange={(v) => v !== null && set({ P: v })} />
              {a.P !== null ? (
                <Button variant="link" size="xs" className="self-start text-[11px]" onClick={() => set({ P: null })}>
                  Use portfolio total ({fmtUsd(portfolioTotal)})
                </Button>
              ) : (
                <span className="text-[11px] text-muted-foreground">Portfolio total</span>
              )}
            </div>
            <NumberField label="Yearly contribution (year end)" kind="usd" value={a.C} min={0} onChange={(v) => v !== null && set({ C: v })} />
            <div className="flex flex-col gap-1">
              <NumberField
                id="fee-rate"
                label="All-in annual fee"
                kind="percent"
                value={e}
                min={0}
                max={0.2}
                allowEmpty={allInRate === null}
                placeholder={e === null ? 'Enter a rate' : undefined}
                onChange={(v) => (v !== null ? set({ e: v }) : allInRate === null && set({ e: null }))}
              />
              {a.e !== null && allInRate !== null ? (
                <Button variant="link" size="xs" className="self-start text-[11px]" onClick={() => set({ e: null })}>
                  Use portfolio all-in ({fmtRate(allInRate)})
                </Button>
              ) : allInRate === null ? (
                <span className="text-[11px] text-warning">Portfolio rate unknown: enter one</span>
              ) : (
                <span className="text-[11px] text-muted-foreground">Portfolio all-in rate</span>
              )}
            </div>
            <div className="flex flex-col gap-1 text-[11px] text-muted-foreground sm:justify-center">
              <span>Grid spans gross returns of 0 to 9% and horizons of 10 to 30 years. Pick a cell to chart it.</span>
            </div>
          </fieldset>
          <div className="flex flex-col gap-1">
            <label htmlFor="include-one-time" className="inline-flex cursor-pointer items-center gap-2 text-[13px]">
              <input
                id="include-one-time"
                type="checkbox"
                className="size-4 accent-primary"
                checked={includeOneTime}
                disabled={oneTime === null}
                onChange={(ev) => set({ includeOneTime: ev.target.checked })}
              />
              <span>
                Include one-time costs <span className="num tabular-nums text-muted-foreground">({fmtUsd(oneTimeTotal, { cents: oneTimeTotal > 0 && oneTimeTotal < 100 })})</span>
              </span>
            </label>
            <p className="text-[11px] text-muted-foreground" data-testid="one-time-convention">
              {ONE_TIME_CONVENTION}
              {includeOneTime ? <> Starting from <span className="num tabular-nums">{fmtUsd(P)}</span>.</> : null}
              {includeOneTime && oneTime && oneTime.unknown.length > 0 ? <span className="text-warning"> Loads on unpriced positions are not included.</span> : null}
            </p>
          </div>
          {unknownCount > 0 ? <UnknownRatiosWarning count={unknownCount} /> : null}
          {e === null ? (
            <p role="status" className="rounded-md border border-dashed border-border px-3 py-4 text-center text-[13px] text-muted-foreground" data-testid="fee-rate-required">
              The portfolio&apos;s all-in fee is unknown. Enter an annual fee rate above to see what fees cost over time.
            </p>
          ) : computed.error ? (
            <p role="alert" className="text-[13px] text-danger">
              These inputs cannot be computed: {computed.error}
            </p>
          ) : (
            <SensitivityGrid
              cells={computed.grid}
              returns={SENSITIVITY_RETURNS}
              horizons={SENSITIVITY_HORIZONS}
              selected={sel}
              onSelect={(r, T) => {
                setSel({ r, T });
                set({ r, T });
              }}
            />
          )}
          {e !== null ? (
            <p className="text-xs text-muted-foreground">
              Dollars lost to fees: ending value at the gross return minus ending value at gross minus {fmtRate(e)}. Hypothetical illustration, not a forecast.
            </p>
          ) : null}
        </CardContent>
      </Card>

      {computed.single ? (
        <ChartFrame
          title={`Growth at ${fmtPct(sel.r, 0)} gross for ${sel.T} years`}
          description="Both paths use the same gross return; the gap is fees."
          actions={<Hypothetical />}
          coverage={
            <dl className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-4">
              <Fig label="Ending value without fees" value={fmtUsd(computed.single.grossFV)} />
              <Fig label="Ending value with fees" value={fmtUsd(computed.single.netFV)} />
              <Fig label="Lost to fees" value={fmtUsd(computed.single.drag)} />
              <Fig label="Share of no-fee value" value={fmtPct(computed.single.dragPctOfGross)} />
            </dl>
          }
          chart={<GrowthChart result={computed.single} />}
          table={<GrowthTable result={computed.single} />}
        />
      ) : null}
    </div>
  );
}

function Fig({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="num text-[17px] font-semibold tracking-tight">{value}</dd>
    </div>
  );
}
