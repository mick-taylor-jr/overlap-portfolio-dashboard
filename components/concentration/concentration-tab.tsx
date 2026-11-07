'use client';

import type { Analysis } from '@/lib/hooks/use-portfolio-analysis';
import { REFERENCE_FUND } from '@/lib/hooks/use-portfolio-analysis';
import { usePortfolio } from '@/lib/portfolio/context';
import { Headline } from './headline';
import { ExposureBars } from './exposure-bars';
import { SectorChart } from './sector-chart';
import { AssetClassBar } from './asset-class-bar';
import { OverlapHeatmap } from './overlap-heatmap';
import { FlagsPanel } from './flags-panel';
import { componentColors } from './colors';
import { AnalysisPending } from '@/components/dashboard/analysis-pending';

export function ConcentrationTab({ analysis }: { analysis: Analysis }) {
  const { state, dispatch } = usePortfolio();
  if (!analysis.exposures || !analysis.sectors || !analysis.assetClasses) return <AnalysisPending analysis={analysis} />;
  const colors = componentColors(analysis.components);

  return (
    <div className="flex flex-col gap-5">
      <Headline analysis={analysis} thresholds={state.thresholds} />
      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <ExposureBars
          result={analysis.exposures}
          coverage={analysis.coverage}
          colors={colors}
          groupByIssuer={state.groupByIssuer}
          onGroupByIssuer={(v) => dispatch({ type: 'groupByIssuer', value: v })}
        />
        <FlagsPanel flags={analysis.flags} thresholds={state.thresholds} />
      </div>
      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-2">
        <SectorChart
          result={analysis.sectors}
          reference={analysis.referenceSectors}
          referenceSource={analysis.referenceSource}
          referenceLabel={`Broad US market (${REFERENCE_FUND})`}
        />
        <div className="flex flex-col gap-5">
          <OverlapHeatmap cells={analysis.overlaps} funds={analysis.funds} threshold={state.thresholds.pairOverlap} />
          <AssetClassBar result={analysis.assetClasses} />
        </div>
      </div>
    </div>
  );
}
