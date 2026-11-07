'use client';

import { Trash2 } from 'lucide-react';
import type { AssetClass, Position } from '@/lib/types';
import type { PositionRow } from '@/lib/hooks/use-portfolio-analysis';
import { usePortfolio } from '@/lib/portfolio/context';
import { fmtPct, fmtRate, fmtUsd } from '@/lib/format';
import { SourceBadge } from '@/components/source-badge';
import { Table, TBody, TD, TFoot, TH, THead, TR } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { NumberField } from '@/components/shared/number-field';
import { Sym } from '@/components/shared/symbol';
import { CLASS_LABEL } from './ticker-search';

export function PositionsTable({ rows, totalValue }: { rows: PositionRow[]; totalValue: number }) {
  const { dispatch } = usePortfolio();
  const update = (id: string, patch: Partial<Position>) => dispatch({ type: 'update', id, patch });

  return (
    <Table aria-label="Positions">
      <THead>
        <TR>
          <TH className="min-w-40">Security</TH>
          <TH>Class</TH>
          <TH numeric className="min-w-36">
            Amount
          </TH>
          <TH numeric>Price</TH>
          <TH numeric>Value</TH>
          <TH numeric>Weight</TH>
          <TH numeric className="min-w-32">
            Expense ratio
          </TH>
          <TH>
            <span className="sr-only">Remove</span>
          </TH>
        </TR>
      </THead>
      <TBody>
        {rows.map((r) => (
          <Row key={r.position.id} r={r} update={update} remove={() => dispatch({ type: 'remove', id: r.position.id })} />
        ))}
      </TBody>
      <TFoot>
        <TR>
          <TD colSpan={4} className="text-muted-foreground">
            {rows.length} {rows.length === 1 ? 'position' : 'positions'}
          </TD>
          <TD numeric className="font-semibold">
            {fmtUsd(totalValue)}
          </TD>
          <TD numeric>{totalValue > 0 ? '100.0%' : ''}</TD>
          <TD colSpan={2} />
        </TR>
      </TFoot>
    </Table>
  );
}

function Row({ r, update, remove }: { r: PositionRow; update: (id: string, patch: Partial<Position>) => void; remove: () => void }) {
  const p = r.position;
  const byValue = p.value !== undefined;
  const loading = r.status === 'loading';
  const isFund = p.assetClass === 'fund';
  const profileEr = r.profile?.expenseRatio ?? null;
  const override = p.feeOverrides?.expenseRatio;

  const setOverride = (v: number | null) => {
    const fo = { ...(p.feeOverrides ?? {}) };
    if (v === null) delete fo.expenseRatio;
    else fo.expenseRatio = v;
    update(p.id, { feeOverrides: Object.keys(fo).length ? fo : undefined });
  };

  return (
    <TR>
      <TD>
        <div className="flex min-w-0 flex-col">
          <span className="flex items-center gap-1.5">
            <Sym>{p.symbol}</Sym>
            {p.synthetic ? <Badge tone="warning">Synthetic</Badge> : null}
            {p.account ? <Badge>{p.account}</Badge> : null}
          </span>
          <span className="max-w-56 truncate text-xs text-muted-foreground" title={r.name}>
            {loading && r.name === p.symbol ? <Skeleton className="mt-1 h-3 w-28" /> : r.name !== p.symbol ? r.name : ' '}
          </span>
        </div>
      </TD>
      <TD>
        <select
          aria-label={`Asset class for ${p.symbol}`}
          value={p.assetClass}
          disabled={p.synthetic}
          onChange={(e) => update(p.id, { assetClass: e.target.value as AssetClass })}
          className="h-8 rounded border border-transparent bg-transparent px-1 text-[13px] hover:border-input focus-visible:border-ring"
        >
          {(Object.keys(CLASS_LABEL) as AssetClass[]).map((c) => (
            <option key={c} value={c}>
              {CLASS_LABEL[c]}
            </option>
          ))}
        </select>
      </TD>
      <TD numeric>
        <div className="flex items-start justify-end gap-1">
          <NumberField
            className="w-28"
            inputClassName="h-8"
            hideLabel
            label={byValue ? `Dollar value of ${p.symbol}` : `Shares of ${p.symbol}`}
            kind={byValue ? 'usd' : 'number'}
            value={byValue ? (p.value ?? null) : (p.quantity ?? null)}
            min={0}
            onChange={(v) => {
              if (v === null || !(v > 0)) return;
              update(p.id, byValue ? { value: v } : { quantity: v });
            }}
          />
          {p.assetClass !== 'cash' && !p.synthetic ? (
            <button
              type="button"
              className="h-8 rounded px-1.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
              title={byValue ? 'Enter shares instead' : 'Enter dollar value instead'}
              aria-label={byValue ? `Enter ${p.symbol} as shares instead` : `Enter ${p.symbol} as dollar value instead`}
              onClick={() => {
                if (byValue) {
                  const q = r.price && p.value ? Number((p.value / r.price).toFixed(4)) : 1;
                  update(p.id, { value: undefined, quantity: q });
                } else {
                  const v = r.value ?? 1000;
                  update(p.id, { quantity: undefined, value: Number(v.toFixed(2)) });
                }
              }}
            >
              {byValue ? 'USD' : 'sh'}
            </button>
          ) : null}
        </div>
      </TD>
      <TD numeric>
        <div className="flex flex-col items-end gap-0.5">
          <span>{p.synthetic ? 'n/a' : loading ? <Skeleton className="h-3.5 w-14" /> : r.price !== null ? fmtUsd(r.price, { cents: true }) : 'unknown'}</span>
          {p.assetClass === 'cash' ? null : p.synthetic ? (
            <SourceBadge p={{ source: 'starter-pack', asOf: '', stale: false }} />
          ) : loading ? null : (
            <SourceBadge p={r.priceSource} />
          )}
        </div>
      </TD>
      <TD numeric className="font-medium">
        {loading ? <Skeleton className="ml-auto h-3.5 w-16" /> : r.value !== null ? fmtUsd(r.value) : <span className="text-warning" title={r.note}>unpriced</span>}
      </TD>
      <TD numeric>{r.weight !== null ? fmtPct(r.weight) : ''}</TD>
      <TD numeric>
        {isFund || override !== undefined || p.synthetic ? (
          <div className="flex flex-col items-end gap-0.5">
            <NumberField
              className="w-24"
              inputClassName="h-8"
              hideLabel
              label={`Expense ratio override for ${p.symbol}`}
              kind="percent"
              allowEmpty
              min={0}
              max={0.2}
              value={override ?? null}
              placeholder={profileEr !== null ? fmtRate(profileEr).replace('%', '') : loading ? '' : 'unknown'}
              onChange={setOverride}
            />
            {override !== undefined ? (
              <SourceBadge p={{ source: p.synthetic ? 'starter-pack' : 'user', asOf: '', stale: false }} />
            ) : r.profile ? (
              <SourceBadge p={r.profile} />
            ) : loading ? null : (
              <span className="text-[10px] text-warning">unknown</span>
            )}
          </div>
        ) : (
          <span className="text-xs text-muted-foreground" title="Direct holdings carry no fund expense ratio">
            none (direct)
          </span>
        )}
      </TD>
      <TD>
        <Button variant="ghost" size="icon" onClick={remove} aria-label={`Remove ${p.symbol}`}>
          <Trash2 aria-hidden />
        </Button>
      </TD>
    </TR>
  );
}
