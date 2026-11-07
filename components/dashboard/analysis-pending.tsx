'use client';

import { AlertTriangle } from 'lucide-react';
import type { Analysis } from '@/lib/hooks/use-portfolio-analysis';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';

/** Shown inside an analysis tab while data loads, when the math rejects the inputs, or when empty. */
export function AnalysisPending({ analysis, onGoToPortfolio }: { analysis: Analysis; onGoToPortfolio?: () => void }) {
  if (analysis.computeError) {
    return (
      <div role="alert" className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger-bg p-4 text-[13px] text-danger">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
        <p>The analysis could not run with these inputs: {analysis.computeError}. Check the amounts and fee settings in the Portfolio and Fees tabs.</p>
      </div>
    );
  }
  if (analysis.components.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border px-6 py-14 text-center">
        <p className="text-[15px] font-medium">Add positions to see this analysis</p>
        <p className="max-w-[48ch] text-[13px] text-muted-foreground">Load a sample portfolio or add your own holdings in the Portfolio tab.</p>
        {onGoToPortfolio ? <Button onClick={onGoToPortfolio}>Go to Portfolio</Button> : null}
      </div>
    );
  }
  return <TabSkeleton />;
}

export function TabSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true" aria-label="Loading analysis">
      <Skeleton className="h-8 w-3/4 max-w-xl" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[92px]" />
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <Skeleton className="h-80" />
        <Skeleton className="h-80" />
      </div>
    </div>
  );
}
