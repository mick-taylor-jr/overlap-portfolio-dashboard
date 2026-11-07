'use client';

import { AlertTriangle, Building2, Layers2, PieChart } from 'lucide-react';
import type { Flag } from '@/lib/finance';
import type { FlagThresholds } from '@/lib/types';
import { DEFAULT_THRESHOLDS } from '@/lib/types';
import { usePortfolio } from '@/lib/portfolio/context';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { NumberField } from '@/components/shared/number-field';

const KIND = {
  'single-name': { label: 'Single name', Icon: Building2 },
  'single-sector': { label: 'Sector', Icon: PieChart },
  'pair-overlap': { label: 'Fund overlap', Icon: Layers2 },
} as const;

/** Heuristic flags against thresholds the user controls. Descriptive, never advice. */
export function FlagsPanel({ flags, thresholds }: { flags: Flag[]; thresholds: FlagThresholds }) {
  const { dispatch } = usePortfolio();
  const set = (patch: Partial<FlagThresholds>) => dispatch({ type: 'thresholds', thresholds: { ...thresholds, ...patch } });
  const isDefault =
    thresholds.singleName === DEFAULT_THRESHOLDS.singleName &&
    thresholds.singleSector === DEFAULT_THRESHOLDS.singleSector &&
    thresholds.pairOverlap === DEFAULT_THRESHOLDS.pairOverlap;

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Concentration flags</CardTitle>
          <CardDescription>Rules of thumb you set. They describe the portfolio; they are not recommendations.</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <fieldset className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <legend className="sr-only">Flag thresholds</legend>
          <NumberField label="Single name above" kind="percent" value={thresholds.singleName} min={0.001} max={1} onChange={(v) => v !== null && set({ singleName: v })} />
          <NumberField label="Single sector above" kind="percent" value={thresholds.singleSector} min={0.001} max={1} onChange={(v) => v !== null && set({ singleSector: v })} />
          <NumberField label="Fund pair overlap above" kind="percent" value={thresholds.pairOverlap} min={0.001} max={1} onChange={(v) => v !== null && set({ pairOverlap: v })} />
        </fieldset>
        {!isDefault ? (
          <Button variant="link" size="xs" className="self-start" onClick={() => dispatch({ type: 'thresholds', thresholds: { ...DEFAULT_THRESHOLDS } })}>
            Restore defaults (10%, 35%, 60%)
          </Button>
        ) : null}
        {flags.length === 0 ? (
          <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-[13px] text-muted-foreground" data-testid="flags-empty">
            Nothing crosses your thresholds.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-md border border-border" aria-label={`${flags.length} concentration flags`} data-testid="flags-list">
            {flags.map((f) => {
              const k = KIND[f.kind];
              return (
                <li key={`${f.kind}-${f.subject}`} className="flex items-start gap-3 px-3 py-2.5">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-muted-foreground">
                      {k.label}
                      {f.lowerBound ? ', lower bound' : ''}
                    </p>
                    <p className="text-[13px]">{f.message}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
