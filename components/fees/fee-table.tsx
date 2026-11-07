'use client';

import { useState } from 'react';
import { ArrowDown, ArrowUp, AlertTriangle } from 'lucide-react';
import type { Analysis } from '@/lib/hooks/use-portfolio-analysis';
import type { OneTimeCosts, PortfolioFees } from '@/lib/finance';
import { fmtPct, fmtRate, fmtUsd } from '@/lib/format';
import { SourceBadge } from '@/components/source-badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TBody, TD, TFoot, TH, THead, TR } from '@/components/ui/table';
import { Sym } from '@/components/shared/symbol';
import { OneTimeCostsButton, OneTimeTotal } from './one-time-costs';

type SortKey = 'symbol' | 'value' | 'expenseRatio' | 'annualFee';

export function FeeTable({ analysis, fees, oneTime }: { analysis: Analysis; fees: PortfolioFees; oneTime: OneTimeCosts | null }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'annualFee', dir: -1 });
  const byComp = new Map(analysis.components.map((c) => [c.symbol, c]));
  const rows = [...fees.rows].sort((a, b) => {
    if (sort.key === 'symbol') return a.symbol.localeCompare(b.symbol) * sort.dir;
    const av = a[sort.key];
    const bv = b[sort.key];
    // Unknowns always sort last, whichever direction.
    if (av === null && bv === null) return 0;
    if (av === null) return 1;
    if (bv === null) return -1;
    return (av - bv) * sort.dir;
  });
  const total = analysis.totalValue;

  const header = (key: SortKey, label: string, numeric = true) => {
    const active = sort.key === key;
    return (
      <TH numeric={numeric} aria-sort={active ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
        <button
          type="button"
          className={`inline-flex items-center gap-1 ${active ? 'text-foreground' : ''}`}
          onClick={() => setSort((s) => ({ key, dir: s.key === key ? ((-s.dir) as 1 | -1) : key === 'symbol' ? 1 : -1 }))}
        >
          {label}
          {active ? sort.dir === 1 ? <ArrowUp className="size-3" aria-hidden /> : <ArrowDown className="size-3" aria-hidden /> : null}
        </button>
      </TH>
    );
  };

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Annual fees by holding</CardTitle>
          <CardDescription>What each position costs per year at today&apos;s value: value times its expense ratio plus any other recurring rate.</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {fees.unknown.length > 0 ? (
          <div role="alert" className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning-bg px-3 py-2 text-[13px] text-warning">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            <p>
              Expense ratio unknown for {fees.unknown.join(', ')}. {fees.unknown.length === 1 ? 'It is' : 'They are'} excluded from the average and the total
              (not counted as zero), so fund fees are understated. Known for {fmtPct(fees.knownFraction, 0)} of value; enter a ratio in the Portfolio tab to
              include {fees.unknown.length === 1 ? 'it' : 'them'}.
            </p>
          </div>
        ) : null}
        <Table aria-label="Fees by holding">
          <THead>
            <TR>
              {header('symbol', 'Holding', false)}
              {header('value', 'Value')}
              {header('expenseRatio', 'Expense ratio')}
              <TH>Source</TH>
              {header('annualFee', 'Annual cost')}
            </TR>
          </THead>
          <TBody>
            {rows.map((r) => {
              const c = byComp.get(r.symbol);
              const row = analysis.rows.find((x) => x.position.symbol === r.symbol);
              const src = row?.expenseSource;
              const positions = analysis.rows.filter((x) => x.position.symbol === r.symbol);
              const ids = new Set(positions.map((x) => x.position.id));
              const costs = oneTime ? oneTime.rows.filter((x) => ids.has(x.id)) : [];
              return (
                <TR key={r.symbol}>
                  <TD className="whitespace-nowrap">
                    <Sym>{r.symbol}</Sym>
                    {c && c.name !== c.symbol ? <span className="ml-2 hidden text-xs text-muted-foreground sm:inline">{c.name}</span> : null}
                    {oneTime && positions.length > 0 ? <OneTimeCostsButton symbol={r.symbol} positions={positions} costs={costs} /> : null}
                  </TD>
                  <TD numeric>{fmtUsd(r.value)}</TD>
                  <TD numeric className={r.expenseRatio === null ? 'text-warning' : undefined}>
                    {fmtRate(r.expenseRatio)}
                  </TD>
                  <TD>
                    {src === 'direct' ? (
                      <span className="text-xs text-muted-foreground">Direct holding, no fund fee</span>
                    ) : src ? (
                      <SourceBadge p={src} />
                    ) : (
                      <span className="text-xs text-warning">unknown</span>
                    )}
                  </TD>
                  <TD numeric className="font-medium">
                    {r.annualFee === null ? <span className="text-warning">unknown</span> : fmtUsd(r.annualFee, { cents: r.annualFee < 100 })}
                  </TD>
                </TR>
              );
            })}
          </TBody>
          <TFoot>
            <TR>
              <TD>Fund fees</TD>
              <TD numeric>{fmtUsd(total)}</TD>
              <TD numeric>{fmtRate(fees.weightedExpenseRatio)}</TD>
              <TD className="text-xs font-normal text-muted-foreground">value-weighted, known only</TD>
              <TD numeric>{fmtUsd(fees.fundFees)}</TD>
            </TR>
            <TR>
              <TD>Advisory fee</TD>
              <TD />
              <TD numeric>{total > 0 ? fmtRate(fees.advisoryFee / total) : ''}</TD>
              <TD />
              <TD numeric>{fmtUsd(fees.advisoryFee)}</TD>
            </TR>
            <TR className="border-t border-border">
              <TD className="font-semibold">All-in</TD>
              <TD />
              <TD numeric className="font-semibold">
                {fmtRate(fees.allInRate)}
              </TD>
              <TD />
              <TD numeric className="font-semibold" data-testid="all-in-annual">
                {fmtUsd(fees.totalAnnualFee)}
              </TD>
            </TR>
          </TFoot>
        </Table>
        {oneTime ? <OneTimeTotal costs={oneTime} /> : null}
      </CardContent>
    </Card>
  );
}
