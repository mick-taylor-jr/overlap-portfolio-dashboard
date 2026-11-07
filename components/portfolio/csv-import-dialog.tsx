'use client';

import { useMemo, useState } from 'react';
import { FileUp } from 'lucide-react';
import type { AssetClass } from '@/lib/types';
import { usePortfolio } from '@/lib/portfolio/context';
import { guessMapping, parseCsv, rowsToPositions, validateRows, type ColumnMapping, type CsvRowResult } from '@/lib/portfolio/csv';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Sym } from '@/components/shared/symbol';
import { CLASS_LABEL } from './ticker-search';

const EXAMPLE = 'symbol,shares\nVOO,40\nQQQ,25\nAAPL,30\nBTC,0.15';

/** Two steps: paste/upload, then confirm the column mapping while every row is validated live. */
export function CsvImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { dispatch, notify, state } = usePortfolio();
  const [text, setText] = useState('');
  const [step, setStep] = useState<'input' | 'map'>('input');
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [classOverrides, setClassOverrides] = useState<Record<number, AssetClass>>({});
  const [replace, setReplace] = useState(state.portfolio.positions.length === 0);

  const rows = useMemo(() => parseCsv(text), [text]);
  const header = rows[0] ?? [];
  const width = rows.reduce((m, r) => Math.max(m, r.length), 0);
  const columns = Array.from({ length: width }, (_, i) => (mapping?.hasHeader ? header[i]?.trim() || `Column ${i + 1}` : `Column ${i + 1}`));

  const results: CsvRowResult[] = useMemo(() => {
    if (!mapping) return [];
    return validateRows(rows, mapping).map((r) => (classOverrides[r.line] ? { ...r, assetClass: classOverrides[r.line] } : r));
  }, [rows, mapping, classOverrides]);
  const valid = results.filter((r) => r.errors.length === 0);
  const invalid = results.length - valid.length;

  const close = () => {
    setStep('input');
    setText('');
    setMapping(null);
    setClassOverrides({});
    onClose();
  };

  const next = () => {
    setMapping(guessMapping(rows));
    setStep('map');
  };

  const doImport = () => {
    if (!mapping || valid.length === 0) return;
    const positions = rowsToPositions(valid, mapping.amountKind);
    if (replace) dispatch({ type: 'replace', portfolio: { ...state.portfolio, name: state.portfolio.name || 'Imported portfolio', positions } });
    else dispatch({ type: 'add', positions });
    notify(
      invalid > 0 ? 'warning' : 'success',
      `Imported ${positions.length} ${positions.length === 1 ? 'position' : 'positions'}${invalid > 0 ? `; skipped ${invalid} ${invalid === 1 ? 'row' : 'rows'} with errors` : ''}.`,
    );
    close();
  };

  const colSelect = (label: string, value: number, onChange: (v: number) => void, allowNone = false) => (
    <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
      {label}
      <Select value={String(value)} onChange={(e) => onChange(Number(e.target.value))} aria-label={label}>
        {allowNone ? <option value="-1">None (guess)</option> : null}
        {columns.map((c, i) => (
          <option key={i} value={i}>
            {c}
          </option>
        ))}
      </Select>
    </label>
  );

  return (
    <Dialog open={open} onClose={close} title="Import positions from CSV" description="Columns needed: a symbol, and either shares or dollar value. Nothing is uploaded; the file is read in your browser.">
      {step === 'input' ? (
        <div className="flex flex-col gap-3">
          <label htmlFor="csv-text" className="text-xs font-medium text-muted-foreground">
            Paste CSV
          </label>
          <textarea
            id="csv-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            spellCheck={false}
            placeholder={EXAMPLE}
            className="w-full rounded-md border border-input bg-card p-2.5 font-mono text-[12.5px]"
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-[13px] hover:bg-muted">
              <FileUp className="size-4" aria-hidden />
              Choose a file
              <input
                type="file"
                accept=".csv,text/csv,text/plain"
                className="sr-only"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (f) setText(await f.text());
                }}
              />
            </label>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setText(EXAMPLE)}>
                Use example
              </Button>
              <Button onClick={next} disabled={rows.length === 0}>
                Map columns
              </Button>
            </div>
          </div>
        </div>
      ) : mapping ? (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {colSelect('Symbol column', mapping.symbol, (v) => setMapping({ ...mapping, symbol: v }))}
            {colSelect('Amount column', mapping.amount, (v) => setMapping({ ...mapping, amount: v }))}
            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              Amount is
              <Select value={mapping.amountKind} onChange={(e) => setMapping({ ...mapping, amountKind: e.target.value as ColumnMapping['amountKind'] })} aria-label="Amount is">
                <option value="shares">Shares / units</option>
                <option value="value">Dollar value</option>
              </Select>
            </label>
            {colSelect('Asset class column', mapping.assetClass, (v) => setMapping({ ...mapping, assetClass: v }), true)}
          </div>
          <div className="flex flex-wrap items-center gap-4 text-[13px]">
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={mapping.hasHeader} onChange={(e) => setMapping({ ...mapping, hasHeader: e.target.checked })} />
              First row is a header
            </label>
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
              Replace current positions
            </label>
          </div>
          <div className="max-h-72 overflow-auto rounded-md border border-border px-3">
            <Table aria-label="Import preview">
              <THead>
                <TR>
                  <TH numeric>Line</TH>
                  <TH>Symbol</TH>
                  <TH>Class</TH>
                  <TH numeric>{mapping.amountKind === 'shares' ? 'Shares' : 'Value'}</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {results.map((r) => (
                  <TR key={r.line} className={r.errors.length ? 'bg-danger-bg/50' : undefined}>
                    <TD numeric className="text-muted-foreground">
                      {r.line}
                    </TD>
                    <TD>{r.symbol ? <Sym>{r.symbol}</Sym> : <span className="text-muted-foreground">blank</span>}</TD>
                    <TD>
                      <select
                        aria-label={`Asset class for line ${r.line}`}
                        value={r.assetClass}
                        onChange={(e) => setClassOverrides((o) => ({ ...o, [r.line]: e.target.value as AssetClass }))}
                        className="h-7 rounded border border-input bg-card px-1 text-xs"
                      >
                        {(Object.keys(CLASS_LABEL) as AssetClass[]).map((c) => (
                          <option key={c} value={c}>
                            {CLASS_LABEL[c]}
                          </option>
                        ))}
                      </select>
                    </TD>
                    <TD numeric>{r.amount ?? <span className="text-muted-foreground">{r.rawAmount || 'blank'}</span>}</TD>
                    <TD>{r.errors.length ? <span className="text-xs text-danger">{r.errors.join('; ')}</span> : <Badge tone="success">Ready</Badge>}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[13px] text-muted-foreground" aria-live="polite">
              {valid.length} ready{invalid > 0 ? `, ${invalid} with errors (skipped)` : ''}. Asset classes are guessed from the ticker; change any that are wrong.
            </p>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setStep('input')}>
                Back
              </Button>
              <Button onClick={doImport} disabled={valid.length === 0}>
                Import {valid.length} {valid.length === 1 ? 'position' : 'positions'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </Dialog>
  );
}
