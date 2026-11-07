/**
 * One-click sample portfolios and the RedHawk Builds starter-pack CSV parser.
 * Samples use dollar `value`s (no quantities), so they render instantly on seed data.
 */
import type { Portfolio, Position } from '@/lib/types';
import { normalizeTicker, toGicsSector } from '@/lib/normalize';
import { STARTER_PACK_CSV } from './starter-pack';

export { STARTER_PACK_CSV, STARTER_PACK_FILENAME } from './starter-pack';

export interface SamplePortfolio {
  id: string;
  name: string;
  description: string;
  portfolio: Portfolio;
}

function pos(sampleId: string, symbol: string, assetClass: Position['assetClass'], value: number): Position {
  return { id: `${sampleId}-${symbol.toLowerCase()}`, symbol, assetClass, value };
}

export const SAMPLE_PORTFOLIOS: readonly SamplePortfolio[] = [
  {
    id: 'sp500-tech',
    name: 'Three S&P 500 funds + a tech ETF',
    description:
      'SPY, VOO and IVV track the same index; QQQ and VGT pile onto the same mega-caps, and Apple is also held directly.',
    portfolio: {
      name: 'Three S&P 500 funds + a tech ETF',
      positions: [
        pos('sp500-tech', 'SPY', 'fund', 30000),
        pos('sp500-tech', 'VOO', 'fund', 30000),
        pos('sp500-tech', 'IVV', 'fund', 25000),
        pos('sp500-tech', 'QQQ', 'fund', 15000),
        pos('sp500-tech', 'VGT', 'fund', 10000),
        pos('sp500-tech', 'AAPL', 'equity', 5000),
      ],
    },
  },
  {
    id: 'classic-60-40',
    name: 'Classic 60/40',
    description: 'Total US market and international stock funds, plus two core bond funds that hold largely the same Treasuries.',
    portfolio: {
      name: 'Classic 60/40',
      positions: [
        pos('classic-60-40', 'VTI', 'fund', 42000),
        pos('classic-60-40', 'VXUS', 'fund', 18000),
        pos('classic-60-40', 'BND', 'fund', 25000),
        pos('classic-60-40', 'AGG', 'fund', 15000),
      ],
    },
  },
  {
    id: 'crypto-etfs',
    name: 'Crypto + ETFs',
    description: 'Bitcoin held both directly and through a spot ETF (IBIT), next to broad index funds and some ether.',
    portfolio: {
      name: 'Crypto + ETFs',
      positions: [
        pos('crypto-etfs', 'VOO', 'fund', 50000),
        pos('crypto-etfs', 'QQQ', 'fund', 20000),
        pos('crypto-etfs', 'IBIT', 'fund', 15000),
        pos('crypto-etfs', 'bitcoin', 'crypto', 10000),
        pos('crypto-etfs', 'ethereum', 'crypto', 5000),
      ],
    },
  },
  {
    id: 'advisor',
    name: 'Advisor portfolio (1% fee)',
    description:
      'Seven overlapping funds (two total-market, two large-growth, a tech sector fund) under a 1% flat advisory fee.',
    portfolio: {
      name: 'Advisor portfolio',
      advisoryFee: { kind: 'flat', rate: 0.01 },
      positions: [
        pos('advisor', 'SCHB', 'fund', 60000),
        pos('advisor', 'VTI', 'fund', 50000),
        pos('advisor', 'SCHG', 'fund', 40000),
        pos('advisor', 'VUG', 'fund', 30000),
        pos('advisor', 'SCHD', 'fund', 30000),
        pos('advisor', 'XLK', 'fund', 20000),
        pos('advisor', 'IEFA', 'fund', 20000),
      ],
    },
  },
];

// ---------------------------------------------------------------------------------------------
// Starter pack CSV
// ---------------------------------------------------------------------------------------------

export const STARTER_PACK_COLUMNS = [
  'record_id',
  'account_id',
  'security_id',
  'sector',
  'currency',
  'market_value_usd',
  'annual_fee_bps',
  'as_of_date',
  'synthetic',
] as const;
type Column = (typeof STARTER_PACK_COLUMNS)[number];

export interface StarterPackError {
  /** 1-based line number in the CSV (header is line 1). */
  line: number;
  recordId?: string;
  field?: Column | 'header';
  message: string;
}

export interface StarterPackParseResult {
  portfolio: Portfolio;
  errors: StarterPackError[];
  /** Number of data rows in the file (excluding header and blank lines). */
  sourceRows: number;
}

/** Minimal RFC 4180 parser: quoted fields, escaped quotes (""), CRLF or LF line endings. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const NUMERIC = /^-?\d+(\.\d+)?$/;

/**
 * Parse the starter-pack holdings CSV into a Portfolio of synthetic direct positions.
 * Rules: non-USD rows and blank/invalid/non-positive market values are REJECTED with an explicit
 * error (never coerced to 0). A blank fee leaves the expense ratio unknown; an invalid fee keeps the
 * position but records an error and sets no override.
 */
export function parseStarterPackHoldings(csvText: string): StarterPackParseResult {
  const errors: StarterPackError[] = [];
  const positions: Position[] = [];
  const all = parseCsv(csvText);
  const rows = all
    .map((cells, idx) => ({ cells, line: idx + 1 }))
    .filter((r) => !(r.cells.length === 1 && r.cells[0].trim() === ''));
  const empty: StarterPackParseResult = {
    portfolio: { name: 'Starter pack (synthetic)', positions },
    errors,
    sourceRows: 0,
  };
  if (rows.length === 0) {
    errors.push({ line: 1, field: 'header', message: 'File is empty.' });
    return empty;
  }
  const header = rows[0].cells.map((h) => h.trim().toLowerCase());
  const idx = {} as Record<Column, number>;
  for (const col of STARTER_PACK_COLUMNS) {
    const i = header.indexOf(col);
    if (i < 0) errors.push({ line: rows[0].line, field: 'header', message: `Missing required column "${col}".` });
    idx[col] = i;
  }
  if (errors.length > 0) return { ...empty, sourceRows: rows.length - 1 };

  const data = rows.slice(1);
  for (const { cells, line } of data) {
    const get = (c: Column) => (cells[idx[c]] ?? '').trim();
    const recordId = get('record_id') || undefined;
    const err = (field: Column, message: string) => errors.push({ line, recordId, field, message });

    const symbol = normalizeTicker(get('security_id'));
    if (!symbol) {
      err('security_id', 'Missing security_id; row skipped.');
      continue;
    }
    const currency = get('currency').toUpperCase();
    if (currency !== 'USD') {
      err('currency', `Unsupported currency "${get('currency') || '(blank)'}"; only USD rows are imported. Row skipped.`);
      continue;
    }
    const mvRaw = get('market_value_usd').replace(/[$,]/g, '');
    if (mvRaw === '') {
      err('market_value_usd', 'Missing market_value_usd; row skipped (not treated as $0).');
      continue;
    }
    const mv = Number(mvRaw);
    if (!NUMERIC.test(mvRaw) || !Number.isFinite(mv) || mv <= 0) {
      err('market_value_usd', `Invalid market_value_usd "${get('market_value_usd')}"; must be a positive number. Row skipped.`);
      continue;
    }

    const position: Position = {
      id: `starter-${recordId ?? `line-${line}`}`,
      symbol,
      assetClass: 'equity',
      value: mv,
      account: get('account_id') || undefined,
      sector: toGicsSector(get('sector')),
      name: get('security_id'),
      synthetic: true,
    };
    const feeRaw = get('annual_fee_bps');
    if (feeRaw !== '') {
      const bps = Number(feeRaw);
      if (!NUMERIC.test(feeRaw) || !Number.isFinite(bps) || bps < 0) {
        err('annual_fee_bps', `Invalid annual_fee_bps "${feeRaw}"; expense ratio left unknown.`);
      } else {
        position.feeOverrides = { expenseRatio: bps / 10000 };
      }
    }
    positions.push(position);
  }
  return { portfolio: { name: 'Starter pack (synthetic)', positions }, errors, sourceRows: data.length };
}

/** Convenience: the bundled starter-pack file, parsed. */
export function loadStarterPackPortfolio(): StarterPackParseResult {
  return parseStarterPackHoldings(STARTER_PACK_CSV);
}
