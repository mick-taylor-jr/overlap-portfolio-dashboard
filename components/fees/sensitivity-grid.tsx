'use client';

import type { FeeDragResult } from '@/lib/finance';
import { fmtPct, fmtUsd, fmtUsdCompact } from '@/lib/format';
import { cn } from '@/components/ui/cn';

export interface GridCell {
  r: number;
  T: number;
  result: FeeDragResult;
}

/**
 * Rows = gross return assumptions, columns = horizons. Each cell is the dollar drag and its share
 * of the no-fee ending value. Selecting a cell drives the growth chart below.
 */
export function SensitivityGrid({
  cells,
  returns,
  horizons,
  selected,
  onSelect,
}: {
  cells: GridCell[];
  returns: number[];
  horizons: number[];
  selected: { r: number; T: number };
  onSelect: (r: number, T: number) => void;
}) {
  const at = (r: number, T: number) => cells.find((c) => c.r === r && c.T === T);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[480px] border-separate border-spacing-0 text-[13px]" aria-label="Fee drag sensitivity: dollars lost to fees by gross return and horizon" data-testid="sensitivity-grid">
        <thead>
          <tr>
            <th scope="col" className="w-36 pb-2 text-left text-xs font-medium text-muted-foreground">
              Gross return
            </th>
            {horizons.map((T) => (
              <th key={T} scope="col" className="pb-2 pr-3 text-right text-xs font-medium text-muted-foreground">
                {T} years
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {returns.map((r) => (
            <tr key={r}>
              <th scope="row" className="border-t border-border py-2 text-left font-normal">
                <span className="num">{fmtPct(r, 0)}</span>
                <span className="text-muted-foreground"> a year</span>
              </th>
              {horizons.map((T) => {
                const c = at(r, T);
                const on = selected.r === r && selected.T === T;
                return (
                  <td key={T} className="border-t border-border p-0">
                    <button
                      type="button"
                      onClick={() => onSelect(r, T)}
                      aria-pressed={on}
                      aria-label={c ? `${fmtPct(r, 0)} for ${T} years: fees cost ${fmtUsd(c.result.drag)}, ${fmtPct(c.result.dragPctOfGross)} of the no-fee value` : undefined}
                      className={cn(
                        'num flex w-full flex-col items-end gap-0.5 rounded-md px-3 py-2 text-right tabular-nums transition-colors hover:bg-muted',
                        on && 'bg-accent ring-1 ring-primary/40 hover:bg-accent',
                      )}
                    >
                      <span className="font-semibold" data-testid={`grid-${r}-${T}`}>
                        {c ? (c.result.drag >= 1e6 ? fmtUsdCompact(c.result.drag) : fmtUsd(c.result.drag)) : 'n/a'}
                      </span>
                      <span className="text-xs text-muted-foreground">{c ? `${fmtPct(c.result.dragPctOfGross)} of no-fee value` : ''}</span>
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
