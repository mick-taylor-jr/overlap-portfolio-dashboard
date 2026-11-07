'use client';

import { useMemo, useState } from 'react';
import { feeDrag, sensitivityGrid } from '@/lib/finance';
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

export const CONVENTION = 'Net return = gross return minus fees, compounded annually, contributions at year end.';

/** Fee drag under the user's own assumptions. The grid is the default view; no single "expected" number. */
export function FeeDragCalculator({ portfolioTotal, allInRate }: { portfolioTotal: number; allInRate: number | null }) {
  const { state, dispatch } = usePortfolio();
  const a = state.feeAssumptions;
  const set = (patch: Partial<FeeAssumptions>) => dispatch({ type: 'feeAssumptions', patch });
  const P = a.P ?? portfolioTotal;
  const e = a.e ?? allInRate ?? 0;
  const [sel, setSel] = useState<{ r: number; T: number }>({ r: a.r, T: a.T });

  const computed = useMemo(() => {
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
          <fieldset className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <legend className="sr-only">Fee drag assumptions</legend>
            <div className="flex flex-col gap-1">
              <NumberField label="Starting value" kind="usd" value={P} min={0} onChange={(v) => v !== null && set({ P: v })} />
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
                onChange={(v) => v !== null && set({ e: v })}
              />
              {a.e !== null ? (
                <Button variant="link" size="xs" className="self-start text-[11px]" onClick={() => set({ e: null })}>
                  Use portfolio all-in ({fmtRate(allInRate)})
                </Button>
              ) : (
                <span className="text-[11px] text-muted-foreground">Portfolio all-in rate</span>
              )}
            </div>
            <div className="flex flex-col gap-1 text-[11px] text-muted-foreground sm:justify-center">
              <span>Grid spans gross returns of 0 to 9% and horizons of 10 to 30 years. Pick a cell to chart it.</span>
            </div>
          </fieldset>
          {computed.error ? (
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
          <p className="text-xs text-muted-foreground">
            Dollars lost to fees: ending value at the gross return minus ending value at gross minus {fmtRate(e)}. Hypothetical illustration, not a forecast.
          </p>
        </CardContent>
      </Card>

      {computed.single ? (
        <ChartFrame
          title={`Growth at ${fmtPct(sel.r, 0)} gross for ${sel.T} years`}
          description="Both paths use the same gross return; the gap is fees."
          actions={<Hypothetical />}
          coverage={
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
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
