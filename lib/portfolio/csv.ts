/**
 * CSV import (paste or upload) with an explicit column-mapping step and per-row validation.
 * A blank or invalid amount is an ERROR for that row, never silently 0.
 */
import type { AssetClass, Portfolio, Position } from '@/lib/types';
import { guessAssetClass, isValidSymbol, normalizeTicker } from './classify';
import { newId } from './state';

/** RFC 4180-ish parser: quoted fields, escaped quotes, CRLF, and auto-detected , ; or tab delimiters. */
export function parseCsv(text: string): string[][] {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const delim = [',', ';', '\t'].reduce((best, d) => (firstLine.split(d).length > firstLine.split(best).length ? d : best), ',');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === delim) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ''));
}

export type AmountKind = 'shares' | 'value';

export interface ColumnMapping {
  hasHeader: boolean;
  symbol: number;
  amount: number;
  amountKind: AmountKind;
  /** -1 = none (guess per row). */
  assetClass: number;
  /** -1 = none. */
  account: number;
}

/** Guess a mapping from header names; the user confirms or changes it in the mapping step. */
export function guessMapping(rows: string[][]): ColumnMapping {
  const header = (rows[0] ?? []).map((h) => h.trim().toLowerCase());
  const looksLikeHeader = header.some((h) => /symbol|ticker|shares|quantity|qty|value|amount|units/.test(h));
  const find = (re: RegExp) => header.findIndex((h) => re.test(h));
  const sharesCol = find(/^(shares|quantity|qty|units)$|shares|quantity/);
  const valueCol = find(/value|amount|usd|\$/);
  const symbolCol = find(/symbol|ticker|security/);
  const useShares = sharesCol >= 0 && (valueCol < 0 || sharesCol <= valueCol);
  return {
    hasHeader: looksLikeHeader,
    symbol: symbolCol >= 0 ? symbolCol : 0,
    amount: useShares ? sharesCol : valueCol >= 0 ? valueCol : 1,
    amountKind: useShares ? 'shares' : valueCol >= 0 ? 'value' : 'shares',
    assetClass: find(/asset.?class|^class$|^type$/),
    account: find(/account/),
  };
}

export interface CsvRowResult {
  line: number;
  rawSymbol: string;
  rawAmount: string;
  symbol: string;
  assetClass: AssetClass;
  amount: number | null;
  account?: string;
  errors: string[];
}

const CLASS_ALIASES: Record<string, AssetClass> = {
  equity: 'equity',
  stock: 'equity',
  stocks: 'equity',
  fund: 'fund',
  etf: 'fund',
  'mutual fund': 'fund',
  mutualfund: 'fund',
  crypto: 'crypto',
  cryptocurrency: 'crypto',
  cash: 'cash',
};

export function parseAmount(raw: string): { value: number | null; error?: string } {
  const t = raw.trim();
  if (t === '') return { value: null, error: 'Amount is blank' };
  const neg = /^\(.*\)$/.test(t) || t.startsWith('-');
  const cleaned = t.replace(/[$,\s()]/g, '').replace(/^-/, '');
  if (!/^\d*\.?\d+$/.test(cleaned)) return { value: null, error: `"${t}" is not a number` };
  const n = Number(cleaned);
  if (neg) return { value: null, error: 'Amount is negative; short positions are not supported' };
  if (!(n > 0)) return { value: null, error: 'Amount must be greater than 0' };
  return { value: n };
}

export function validateRows(rows: string[][], m: ColumnMapping): CsvRowResult[] {
  const body = m.hasHeader ? rows.slice(1) : rows;
  const offset = m.hasHeader ? 2 : 1;
  return body.map((r, i) => {
    const errors: string[] = [];
    const rawSymbol = (r[m.symbol] ?? '').trim();
    const rawAmount = r[m.amount] ?? '';
    let assetClass: AssetClass;
    let symbol: string;
    const guessed = guessAssetClass(rawSymbol);
    if (m.assetClass >= 0) {
      const c = CLASS_ALIASES[(r[m.assetClass] ?? '').trim().toLowerCase()];
      if (c) {
        assetClass = c;
        symbol = c === 'crypto' ? guessed.symbol.toLowerCase() : normalizeTicker(rawSymbol);
      } else {
        assetClass = guessed.assetClass;
        symbol = guessed.symbol;
        if ((r[m.assetClass] ?? '').trim()) errors.push(`Unknown asset class "${r[m.assetClass]}"`);
      }
    } else {
      assetClass = guessed.assetClass;
      symbol = guessed.symbol;
    }
    if (!rawSymbol) errors.push('Symbol is blank');
    else if (!isValidSymbol(symbol, assetClass)) errors.push(`"${rawSymbol}" is not a valid symbol`);
    const amt = parseAmount(rawAmount);
    if (amt.error) errors.push(amt.error);
    const account = m.account >= 0 ? (r[m.account] ?? '').trim() || undefined : undefined;
    return { line: i + offset, rawSymbol, rawAmount, symbol, assetClass, amount: amt.value, account, errors };
  });
}

export function rowsToPositions(rows: CsvRowResult[], kind: AmountKind): Position[] {
  return rows
    .filter((r) => r.errors.length === 0 && r.amount !== null)
    .map((r) => {
      const base: Position = { id: newId(), symbol: r.symbol, assetClass: r.assetClass };
      if (r.account) base.account = r.account;
      // Cash has a price of $1, so "shares" of cash are dollars.
      if (kind === 'value' || r.assetClass === 'cash') base.value = r.amount ?? undefined;
      else base.quantity = r.amount ?? undefined;
      return base;
    });
}

function csvField(v: string | number | undefined): string {
  if (v === undefined) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function portfolioToCsv(p: Portfolio): string {
  const header = ['symbol', 'asset_class', 'shares', 'value', 'account', 'name', 'sector', 'expense_ratio_override'];
  const lines = p.positions.map((x) =>
    [x.symbol, x.assetClass, x.quantity, x.value, x.account, x.name, x.sector, x.feeOverrides?.expenseRatio].map(csvField).join(','),
  );
  return [header.join(','), ...lines].join('\n');
}

export function downloadText(filename: string, text: string, mime: string): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
