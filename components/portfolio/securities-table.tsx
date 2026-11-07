'use client';

import type { Component } from '@/lib/hooks/use-portfolio-analysis';
import { fmtPct, fmtRate, fmtUsd } from '@/lib/format';
import { Table, TBody, TD, TFoot, TH, THead, TR } from '@/components/ui/table';
import { Sym } from '@/components/shared/symbol';
import { CLASS_LABEL } from './ticker-search';

/** Positions merged by security across accounts (the starter pack spreads 15 securities over 6 accounts). */
export function SecuritiesTable({ components, totalValue }: { components: Component[]; totalValue: number }) {
  const sorted = [...components].sort((a, b) => (b.value ?? -1) - (a.value ?? -1));
  return (
    <Table aria-label="Holdings aggregated by security">
      <THead>
        <TR>
          <TH>Security</TH>
          <TH>Class</TH>
          <TH>Sector</TH>
          <TH numeric>Accounts</TH>
          <TH numeric>Value</TH>
          <TH numeric>Weight</TH>
          <TH numeric>Fee rate</TH>
        </TR>
      </THead>
      <TBody>
        {sorted.map((c) => {
          const sector = c.input.sectorWeights ? Object.keys(c.input.sectorWeights)[0] : undefined;
          return (
            <TR key={c.key}>
              <TD>
                <Sym>{c.symbol}</Sym>
                {c.name !== c.symbol ? <span className="ml-2 text-xs text-muted-foreground">{c.name}</span> : null}
              </TD>
              <TD>{CLASS_LABEL[c.assetClass]}</TD>
              <TD className="text-muted-foreground">{sector ?? 'not disclosed'}</TD>
              <TD numeric>
                <span title={c.accounts.map((a) => `${a.account}: ${fmtUsd(a.value)}`).join('\n')}>{c.accounts.length || 1}</span>
              </TD>
              <TD numeric className="font-medium">
                {fmtUsd(c.value)}
              </TD>
              <TD numeric>{c.value !== null && totalValue > 0 ? fmtPct(c.value / totalValue) : ''}</TD>
              <TD numeric>{fmtRate(c.expenseRatio)}</TD>
            </TR>
          );
        })}
      </TBody>
      <TFoot>
        <TR>
          <TD colSpan={4} className="text-muted-foreground">
            {sorted.length} securities
          </TD>
          <TD numeric className="font-semibold">
            {fmtUsd(totalValue)}
          </TD>
          <TD colSpan={2} />
        </TR>
      </TFoot>
    </Table>
  );
}

/** Accounts roll-up: one row per account with its value and share. */
export function AccountsSummary({ components }: { components: Component[] }) {
  const byAcct = new Map<string, { value: number; count: number; unknown: number }>();
  for (const c of components)
    for (const a of c.accounts) {
      const cur = byAcct.get(a.account) ?? { value: 0, count: 0, unknown: 0 };
      if (a.value === null) cur.unknown++;
      else cur.value += a.value;
      cur.count++;
      byAcct.set(a.account, cur);
    }
  if (byAcct.size === 0) return null;
  const total = [...byAcct.values()].reduce((s, a) => s + a.value, 0);
  const rows = [...byAcct.entries()].sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }));
  return (
    <Table aria-label="Value by account">
      <THead>
        <TR>
          <TH>Account</TH>
          <TH numeric>Positions</TH>
          <TH numeric>Value</TH>
          <TH numeric>Share</TH>
        </TR>
      </THead>
      <TBody>
        {rows.map(([acct, a]) => (
          <TR key={acct}>
            <TD>{acct}</TD>
            <TD numeric>{a.count}</TD>
            <TD numeric>{fmtUsd(a.value)}</TD>
            <TD numeric>{total > 0 ? fmtPct(a.value / total) : ''}</TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
