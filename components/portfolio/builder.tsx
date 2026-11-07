'use client';

import { useState } from 'react';
import type { Analysis } from '@/lib/hooks/use-portfolio-analysis';
import { usePortfolio } from '@/lib/portfolio/context';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Segmented } from '@/components/ui/tabs';
import { TickerSearch } from './ticker-search';
import { PositionsTable } from './positions-table';
import { AccountsSummary, SecuritiesTable } from './securities-table';
import { SampleGallery } from './sample-gallery';

export function PortfolioBuilder({ analysis, onSampleLoaded }: { analysis: Analysis; onSampleLoaded?: () => void }) {
  const { state, dispatch } = usePortfolio();
  const empty = state.portfolio.positions.length === 0;
  const [view, setView] = useState<'positions' | 'securities'>('positions');
  const showAgg = analysis.hasAccounts;
  const effectiveView = showAgg ? view : 'positions';

  return (
    <div className="flex flex-col gap-5">
      {empty ? <SampleGallery prominent onLoaded={onSampleLoaded} /> : null}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Positions</CardTitle>
            <CardDescription>Enter shares or a dollar value for each. Expense ratios fill in from fund data; type over one to override it.</CardDescription>
          </div>
          {showAgg ? (
            <Segmented
              label="Positions view"
              value={effectiveView}
              onValueChange={setView}
              options={[
                { value: 'positions', label: 'By account' },
                { value: 'securities', label: 'By security' },
              ]}
            />
          ) : null}
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <TickerSearch onAdd={(p) => dispatch({ type: 'add', positions: [p] })} />
          {empty ? (
            <p className="rounded-md border border-dashed border-border px-4 py-8 text-center text-[13px] text-muted-foreground">
              No positions yet. Search for a ticker above, import a CSV, or load a sample.
            </p>
          ) : effectiveView === 'positions' ? (
            <PositionsTable rows={analysis.rows} totalValue={analysis.totalValue} />
          ) : (
            <SecuritiesTable components={analysis.components} totalValue={analysis.totalValue} />
          )}
          {analysis.unpriced.length > 0 ? (
            <p className="text-xs text-warning" role="status">
              No price for {analysis.unpriced.join(', ')}. Those positions are left out of every total until you enter a dollar value.
            </p>
          ) : null}
        </CardContent>
      </Card>
      {showAgg ? (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Accounts</CardTitle>
              <CardDescription>The same security held in several accounts counts once in the look-through analysis.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <AccountsSummary components={analysis.components} />
          </CardContent>
        </Card>
      ) : null}
      {!empty ? <SampleGallery prominent={false} onLoaded={onSampleLoaded} /> : null}
    </div>
  );
}
