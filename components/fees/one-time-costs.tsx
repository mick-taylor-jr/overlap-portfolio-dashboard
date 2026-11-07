'use client';

import { useState } from 'react';
import { AlertTriangle, Receipt } from 'lucide-react';
import type { OneTimeCostRow, OneTimeCosts } from '@/lib/finance';
import type { PositionRow } from '@/lib/hooks/use-portfolio-analysis';
import { usePortfolio } from '@/lib/portfolio/context';
import type { PortfolioAction } from '@/lib/portfolio/reducer';
import { fmtUsd } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { NumberField } from '@/components/shared/number-field';
import { Sym } from '@/components/shared/symbol';

type FeeOverridesPatch = Extract<PortfolioAction, { type: 'feeOverrides' }>['patch'];

export const ONE_TIME_NOTE = 'Front and back loads and transaction costs are paid once, not every year, so they are not in annual fees or the all-in rate.';

/** Sum one symbol's position rows; null when any of them cannot be priced. */
export function sumRows(rows: readonly OneTimeCostRow[]): { total: number | null; hasAny: boolean } {
  const hasAny = rows.some((r) => r.hasAny);
  if (rows.some((r) => r.total === null)) return { total: null, hasAny };
  return { total: rows.reduce((s, r) => s + (r.total ?? 0), 0), hasAny };
}

function money(v: number | null): string {
  return v === null ? 'unknown' : fmtUsd(v, { cents: v < 100 });
}

/** Per-holding control: icon button in the fee table that opens the editor for every position of the symbol. */
export function OneTimeCostsButton({ symbol, positions, costs }: { symbol: string; positions: PositionRow[]; costs: OneTimeCostRow[] }) {
  const [open, setOpen] = useState(false);
  const { total, hasAny } = sumRows(costs);
  return (
    <>
      <Button
        variant="ghost"
        size="xs"
        className="ml-1 h-6 px-1 text-muted-foreground hover:text-foreground"
        aria-label={`Edit one-time costs for ${symbol}`}
        title="One-time costs"
        onClick={() => setOpen(true)}
      >
        <Receipt aria-hidden />
      </Button>
      {hasAny ? (
        <span className={`num block whitespace-nowrap text-[11px] tabular-nums ${total === null ? 'text-warning' : 'text-muted-foreground'}`}>One-time {money(total)}</span>
      ) : null}
      <OneTimeCostsDialog open={open} onClose={() => setOpen(false)} symbol={symbol} positions={positions} costs={costs} />
    </>
  );
}

function OneTimeCostsDialog({
  open,
  onClose,
  symbol,
  positions,
  costs,
}: {
  open: boolean;
  onClose: () => void;
  symbol: string;
  positions: PositionRow[];
  costs: OneTimeCostRow[];
}) {
  const { dispatch } = usePortfolio();
  const byId = new Map(costs.map((c) => [c.id, c]));
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`One-time costs: ${symbol}`}
      description={
        <>
          {ONE_TIME_NOTE} Loads are percentages of value; the back load is estimated on today&apos;s value. Transaction costs stay on this device and are
          never put in share links.
        </>
      }
      className="w-[min(560px,calc(100vw-2rem))]"
    >
      <div className="flex flex-col gap-4">
        {positions.map((row, i) => {
          const p = row.position;
          const fo = p.feeOverrides ?? {};
          const c = byId.get(p.id);
          const set = (patch: FeeOverridesPatch) => dispatch({ type: 'feeOverrides', id: p.id, patch });
          return (
            <fieldset key={p.id} className="flex min-w-0 flex-col gap-2 border-t border-border pt-3 first:border-0 first:pt-0">
              <legend className="sr-only">
                {symbol} {p.account ?? `position ${i + 1}`}
              </legend>
              <div className="flex items-baseline justify-between gap-2 text-[13px]">
                <span className="min-w-0 truncate">
                  <Sym>{symbol}</Sym>
                  {positions.length > 1 ? <span className="ml-2 text-muted-foreground">{p.account ?? `Position ${i + 1}`}</span> : null}
                </span>
                <span className="num shrink-0 text-right tabular-nums text-muted-foreground">Value {fmtUsd(row.value)}</span>
              </div>
              <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-3">
                <NumberField
                  id={`otc-fl-${p.id}`}
                  label="Front load"
                  kind="percent"
                  min={0}
                  max={1}
                  allowEmpty
                  placeholder="None"
                  value={fo.frontLoad ?? null}
                  onChange={(v) => set({ frontLoad: v ?? undefined })}
                />
                <NumberField
                  id={`otc-bl-${p.id}`}
                  label="Back load"
                  kind="percent"
                  min={0}
                  max={1}
                  allowEmpty
                  placeholder="None"
                  value={fo.backLoad ?? null}
                  onChange={(v) => set({ backLoad: v ?? undefined })}
                />
                <NumberField
                  id={`otc-tc-${p.id}`}
                  label="Transaction cost"
                  kind="usd"
                  min={0}
                  allowEmpty
                  placeholder="None"
                  value={fo.transactionCost ?? null}
                  onChange={(v) => set({ transactionCost: v ?? undefined })}
                />
              </div>
              {c ? (
                <dl className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs sm:grid-cols-4">
                  <Line label="Front" value={money(c.frontLoad)} />
                  <Line label="Back" value={money(c.backLoad)} />
                  <Line label="Transaction" value={money(c.transactionCost)} />
                  <Line label="Total" value={money(c.total)} strong />
                </dl>
              ) : null}
              {c && c.total === null ? (
                <p className="text-[11px] text-warning">No value for this position yet, so its loads cannot be priced. They are left out of the total, not counted as zero.</p>
              ) : null}
            </fieldset>
          );
        })}
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={`num text-right tabular-nums ${strong ? 'font-semibold' : ''} ${value === 'unknown' ? 'text-warning' : ''}`}>{value}</dd>
    </div>
  );
}

/** Portfolio total, shown apart from the annual lines. */
export function OneTimeTotal({ costs }: { costs: OneTimeCosts }) {
  return (
    <div className="flex flex-col gap-1 rounded-md border border-dashed border-border px-3 py-2.5" data-testid="one-time-total">
      <div className="flex items-baseline justify-between gap-3 text-[13px]">
        <span className="font-medium">One-time costs</span>
        <span className="num text-right font-semibold tabular-nums">{fmtUsd(costs.total, { cents: costs.total > 0 && costs.total < 100 })}</span>
      </div>
      <p className="text-xs text-muted-foreground">
        {ONE_TIME_NOTE} {costs.hasAny ? '' : 'None entered: use the receipt button on a holding to add them.'}
      </p>
      {costs.unknown.length > 0 ? (
        <p role="status" className="flex items-start gap-1.5 text-xs text-warning">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {costs.unknown.length} {costs.unknown.length === 1 ? 'position has' : 'positions have'} a load but no value yet; left out of this total (not counted as zero).
        </p>
      ) : null}
    </div>
  );
}
