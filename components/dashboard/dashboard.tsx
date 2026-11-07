'use client';

import { useState } from 'react';
import { usePortfolio } from '@/lib/portfolio/context';
import { usePortfolioAnalysis } from '@/lib/hooks/use-portfolio-analysis';
import { fmtUsd } from '@/lib/format';
import { Tabs, TabPanel } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { NoticeBar } from '@/components/shared/notice-bar';
import { DataStatus } from '@/components/shared/data-status';
import { PortfolioBuilder } from '@/components/portfolio/builder';
import { PortfolioActions } from '@/components/portfolio/portfolio-actions';
import { ConcentrationTab } from '@/components/concentration/concentration-tab';
import { FeesTab } from '@/components/fees/fees-tab';
import { CompareTab } from '@/components/compare/compare-tab';
import { AnalysisPending, TabSkeleton } from './analysis-pending';
import { Skeleton } from '@/components/ui/skeleton';

type Tab = 'portfolio' | 'concentration' | 'fees' | 'compare';
const ID = 'dash';

export function Dashboard() {
  const { state, dispatch, hydrated, persistent } = usePortfolio();
  const analysis = usePortfolioAnalysis();
  const [tab, setTab] = useState<Tab>('portfolio');
  const empty = state.portfolio.positions.length === 0;
  const flagCount = analysis.flags.length;

  const tabs = [
    { value: 'portfolio' as const, label: 'Portfolio' },
    {
      value: 'concentration' as const,
      label: (
        <>
          Concentration
          {!empty && flagCount > 0 ? (
            <Badge tone="warning" aria-label={`${flagCount} flags`}>
              {flagCount}
            </Badge>
          ) : null}
        </>
      ),
    },
    { value: 'fees' as const, label: 'Fees' },
    { value: 'compare' as const, label: 'Compare schedules' },
  ];

  return (
    <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-4 px-4 py-5 sm:px-6">
      <section aria-label="Portfolio summary" className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor="portfolio-name" className="sr-only">
            Portfolio name
          </label>
          {hydrated ? (
            <input
              id="portfolio-name"
              value={state.portfolio.name}
              onChange={(e) => dispatch({ type: 'rename', name: e.target.value })}
              className="-ml-1 min-w-0 max-w-full rounded border min-w-[10ch] pr-2 [field-sizing:content] border-transparent bg-transparent px-1 text-xl font-semibold tracking-tight hover:border-border focus-visible:border-ring"
            />
          ) : (
            <Skeleton className="h-7 w-56" />
          )}
          <p className="num text-[13px] text-muted-foreground" aria-live="polite">
            {hydrated && !empty ? (
              <>
                <span className="font-medium text-foreground">{fmtUsd(analysis.totalValue)}</span> across {state.portfolio.positions.length}{' '}
                {state.portfolio.positions.length === 1 ? 'position' : 'positions'}
                {analysis.isFetching ? ', updating prices' : ''}
              </>
            ) : hydrated ? (
              'No positions yet'
            ) : (
              ' '
            )}
            {hydrated && !persistent ? <span className="text-warning">. This browser is not saving changes (storage is unavailable).</span> : null}
          </p>
        </div>
        {hydrated ? <PortfolioActions analysis={analysis} /> : null}
      </section>

      <NoticeBar />
      <DataStatus analysis={hydrated && !empty ? analysis : null} />
      {analysis.requestError ? (
        <p role="alert" className="text-[13px] text-warning">
          Some market data could not be loaded ({analysis.requestError}). Affected positions show as unpriced or unknown.
        </p>
      ) : null}

      <div className="border-b border-border">
        <Tabs idBase={ID} label="Dashboard sections" items={tabs} value={tab} onValueChange={setTab} />
      </div>

      {!hydrated ? (
        <TabSkeleton />
      ) : (
        <>
          <TabPanel idBase={ID} value="portfolio" active={tab === 'portfolio'}>
            <PortfolioBuilder analysis={analysis} onSampleLoaded={() => setTab('concentration')} />
          </TabPanel>
          <TabPanel idBase={ID} value="concentration" active={tab === 'concentration'}>
            {empty ? <AnalysisPending analysis={analysis} onGoToPortfolio={() => setTab('portfolio')} /> : <ConcentrationTab analysis={analysis} />}
          </TabPanel>
          <TabPanel idBase={ID} value="fees" active={tab === 'fees'}>
            {empty ? <AnalysisPending analysis={analysis} onGoToPortfolio={() => setTab('portfolio')} /> : <FeesTab analysis={analysis} />}
          </TabPanel>
          <TabPanel idBase={ID} value="compare" active={tab === 'compare'}>
            <CompareTab analysis={analysis} />
          </TabPanel>
        </>
      )}
    </div>
  );
}
