'use client';

import type { Analysis } from '@/lib/hooks/use-portfolio-analysis';
import { usePortfolio } from '@/lib/portfolio/context';
import { fmtRate, fmtUsd } from '@/lib/format';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AnalysisPending } from '@/components/dashboard/analysis-pending';
import { FeeTable } from './fee-table';
import { AdvisoryEditor } from './advisory-editor';
import { FeeDragCalculator } from './fee-drag';

export function FeesTab({ analysis }: { analysis: Analysis }) {
  const { state, dispatch } = usePortfolio();
  const fees = analysis.fees;
  if (!fees) return <AnalysisPending analysis={analysis} />;

  return (
    <div className="flex flex-col gap-5">
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border lg:grid-cols-4" aria-label="Fee totals">
        <Total label="Fund fees per year" value={fmtUsd(fees.fundFees)} note={`Weighted expense ratio ${fmtRate(fees.weightedExpenseRatio)}${fees.unknown.length ? ', known funds only' : ''}`} />
        <Total label="Advisory fee per year" value={fmtUsd(fees.advisoryFee)} note={state.portfolio.advisoryFee ? 'From your schedule' : 'None set'} />
        <Total label="All-in per year" value={fmtUsd(fees.totalAnnualFee)} note={`On ${fmtUsd(analysis.totalValue)}`} />
        <Total label="All-in rate" value={fmtRate(fees.allInRate)} note={fees.unknown.length ? `${fees.unknown.length} unknown excluded` : 'Every ratio known'} />
      </dl>
      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <FeeTable analysis={analysis} fees={fees} />
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Advisory fee</CardTitle>
              <CardDescription>Charged on the whole portfolio, on top of fund expense ratios.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <AdvisoryEditor idPrefix="portfolio-adv" fee={state.portfolio.advisoryFee} aum={analysis.totalValue} onChange={(f) => dispatch({ type: 'advisory', fee: f })} />
          </CardContent>
        </Card>
      </div>
      <FeeDragCalculator portfolioTotal={analysis.totalValue} allInRate={fees.allInRate} unknownCount={fees.unknown.length} />
    </div>
  );
}

function Total({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 bg-card px-4 py-3.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-[24px] font-semibold leading-none tracking-tight">{value}</dd>
      <dd className="truncate text-xs text-muted-foreground">{note}</dd>
    </div>
  );
}
