#!/usr/bin/env node
/**
 * Builds data/seed/{fund-profiles,quotes,crypto}.json from the hand-captured raw files in
 * scripts/seed/raw/. Every number in raw/ was copied from a public source page (see
 * docs/DATA_SOURCES.md); this script only converts percent -> decimal, normalizes tickers and
 * sector labels, and computes holdingsCoverage. It never fills gaps.
 *
 * Usage: node scripts/seed/build.mjs   (Node >= 22.18, uses built-in TypeScript type stripping)
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const raw = join(here, 'raw');
const { normalizeTicker, mapSectorWeights } = await import(join(root, 'lib/normalize/index.ts'));

const CAPTURED_AT = '2026-11-07';
const round = (x, d = 6) => Math.round(x * 10 ** d) / 10 ** d;
const lines = (f) =>
  readFileSync(join(raw, f), 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));

const FUND_NAMES = {
  SPY: 'State Street SPDR S&P 500 ETF Trust',
  VOO: 'Vanguard S&P 500 ETF',
  IVV: 'iShares Core S&P 500 ETF',
  VTI: 'Vanguard Total Stock Market ETF',
  ITOT: 'iShares Core S&P Total U.S. Stock Market ETF',
  SCHB: 'Schwab U.S. Broad Market ETF',
  QQQ: 'Invesco QQQ Trust',
  QQQM: 'Invesco NASDAQ 100 ETF',
  VGT: 'Vanguard Information Technology ETF',
  XLK: 'State Street Technology Select Sector SPDR ETF',
  SCHD: 'Schwab U.S. Dividend Equity ETF',
  VYM: 'Vanguard High Dividend Yield ETF',
  VXUS: 'Vanguard Total International Stock ETF',
  VEA: 'Vanguard FTSE Developed Markets ETF',
  IEFA: 'iShares Core MSCI EAFE ETF',
  VT: 'Vanguard Total World Stock ETF',
  AGG: 'iShares Core U.S. Aggregate Bond ETF',
  BND: 'Vanguard Total Bond Market ETF',
  TLT: 'iShares 20+ Year Treasury Bond ETF',
  SCHG: 'Schwab U.S. Large-Cap Growth ETF',
  VUG: 'Vanguard Growth ETF',
  VTV: 'Vanguard Value ETF',
  RSP: 'Invesco S&P 500 Equal Weight ETF',
  XLF: 'State Street Financial Select Sector SPDR ETF',
  XLV: 'State Street Health Care Select Sector SPDR ETF',
  ARKK: 'ARK Innovation ETF',
  IBIT: 'iShares Bitcoin Trust ETF',
  FBTC: 'Fidelity Wise Origin Bitcoin Fund',
  GBTC: 'Grayscale Bitcoin Trust ETF',
  ETHA: 'iShares Ethereum Trust ETF',
};

const STOCK_NAMES = {
  AAPL: 'Apple Inc.', MSFT: 'Microsoft Corporation', NVDA: 'NVIDIA Corporation',
  GOOGL: 'Alphabet Inc. (Class A)', GOOG: 'Alphabet Inc. (Class C)', AMZN: 'Amazon.com, Inc.',
  META: 'Meta Platforms, Inc.', TSLA: 'Tesla, Inc.', 'BRK-B': 'Berkshire Hathaway Inc. (Class B)',
  AVGO: 'Broadcom Inc.', JPM: 'JPMorgan Chase & Co.', LLY: 'Eli Lilly and Company', V: 'Visa Inc.',
  UNH: 'UnitedHealth Group Incorporated', XOM: 'Exxon Mobil Corporation', MA: 'Mastercard Incorporated',
  COST: 'Costco Wholesale Corporation', HD: 'The Home Depot, Inc.', PG: 'The Procter & Gamble Company',
  JNJ: 'Johnson & Johnson', NFLX: 'Netflix, Inc.', WMT: 'Walmart Inc.', ORCL: 'Oracle Corporation',
  AMD: 'Advanced Micro Devices, Inc.', KO: 'The Coca-Cola Company', PEP: 'PepsiCo, Inc.',
  CRM: 'Salesforce, Inc.', BAC: 'Bank of America Corporation', CVX: 'Chevron Corporation',
  MRK: 'Merck & Co., Inc.',
};

/** Asset allocation only where the source reported it (decimal). */
const ASSET_ALLOCATION = {
  IVV: { stock: 0.9994, bond: 0, cash: 0.0006, other: 0 }, // iShares: cash and/or derivatives 0.06%
  ITOT: { stock: 0.9979, bond: 0, cash: 0.0021, other: 0 }, // iShares: cash and/or derivatives 0.21%
  IEFA: { stock: 0.9937, bond: 0, cash: 0.0063, other: 0 }, // iShares: cash and/or derivatives 0.63%
  AGG: { stock: 0, bond: 0.9925, cash: 0.0075, other: 0 }, // iShares: cash and/or derivatives 0.75%
  TLT: { stock: 0, bond: 1, cash: 0, other: 0 }, // iShares: treasuries 100.01%, cash -0.01% (rounded)
  BND: { stock: 0, bond: 1, cash: 0, other: 0 }, // Vanguard fact sheet: short-term reserves 0.0%
  IBIT: { stock: 0, bond: 0, cash: 0, other: 0, crypto: 1 },
  FBTC: { stock: 0, bond: 0, cash: 0, other: 0, crypto: 1 },
  GBTC: { stock: 0, bond: 0, cash: 0, other: 0, crypto: 1 },
  ETHA: { stock: 0, bond: 0, cash: 0, other: 0, crypto: 1 },
};

const CRYPTO_FUNDS = {
  IBIT: { symbol: 'bitcoin', name: 'Bitcoin' },
  FBTC: { symbol: 'bitcoin', name: 'Bitcoin' },
  GBTC: { symbol: 'bitcoin', name: 'Bitcoin' },
  ETHA: { symbol: 'ethereum', name: 'Ethereum' },
};

// ---- fund metadata (sectors.txt) ----
const meta = new Map();
for (const l of lines('sectors.txt')) {
  const [sym, er, erSource, total, countSource, sectorSource, sectorAsOf, sectors, scheme] = l.split('|');
  const pct = {};
  for (const part of (sectors ?? '').split(';').filter(Boolean)) {
    const i = part.lastIndexOf(':');
    pct[part.slice(0, i)] = Number(part.slice(i + 1)) / 100;
  }
  meta.set(sym, {
    expenseRatio: er ? round(Number(er) / 100, 8) : null,
    erSource,
    total: total ? Number(total) : null,
    countSource,
    sectorSource,
    sectorAsOf,
    sectorWeights: Object.fromEntries(
      Object.entries(mapSectorWeights(pct)).map(([k, v]) => [k, round(v, 6)]),
    ),
    scheme,
  });
}

// ---- holdings (raw/<SYM>.txt) ----
const holdingFiles = new Map();
for (const f of readdirSync(raw).filter((f) => /^[A-Z]+\.txt$/.test(f))) {
  const [header, ...rows] = lines(f);
  const h = Object.fromEntries(header.split('|').map((kv) => kv.split('=')));
  const holdings = rows.map((r) => {
    const [s, name, w] = r.split('|');
    return { symbol: normalizeTicker(s), name, weight: round(Number(w) / 100, 6) };
  });
  holdingFiles.set(f.replace('.txt', ''), { ...h, holdings });
}

const profiles = [];
const coverageRows = [];
for (const sym of Object.keys(FUND_NAMES)) {
  const m = meta.get(sym);
  if (!m) throw new Error(`missing metadata for ${sym}`);
  let holdings;
  let holdingsAsOf;
  let holdingsSource;
  let totalFromHoldingsPage = null;
  if (CRYPTO_FUNDS[sym]) {
    holdings = [{ ...CRYPTO_FUNDS[sym], weight: 1 }];
    holdingsAsOf = m.sectorAsOf;
    holdingsSource = 'issuer (single-asset trust)';
  } else {
    const hf = holdingFiles.get(sym);
    if (!hf) throw new Error(`missing holdings for ${sym}`);
    holdings = hf.holdings;
    holdingsAsOf = hf.asof;
    holdingsSource = hf.src;
    totalFromHoldingsPage = Number(hf.total);
  }
  const coverage = round(holdings.reduce((a, h) => a + h.weight, 0), 6);
  const profile = {
    symbol: sym,
    name: FUND_NAMES[sym],
    expenseRatio: m.expenseRatio,
    holdings,
    sectorWeights: m.sectorWeights,
    ...(ASSET_ALLOCATION[sym] ? { assetAllocation: ASSET_ALLOCATION[sym] } : {}),
    holdingsCoverage: Math.min(coverage, 1),
    totalHoldingsCount: m.total ?? totalFromHoldingsPage ?? null,
    source: 'seed',
    asOf: CAPTURED_AT,
    stale: true,
  };
  profiles.push(profile);
  coverageRows.push({
    symbol: sym,
    expenseRatio: m.expenseRatio,
    erSource: m.erSource,
    holdingsSource,
    holdingsAsOf,
    holdingsListed: holdings.length,
    coverage: profile.holdingsCoverage,
    totalHoldingsCount: profile.totalHoldingsCount,
    sectorSource: m.sectorSource,
    sectorAsOf: m.sectorAsOf,
    sectorScheme: m.scheme,
  });
}

// ---- quotes ----
const quotes = lines('quotes.txt').map((l) => {
  const [s, price, date] = l.split('|');
  const symbol = normalizeTicker(s);
  const name = FUND_NAMES[symbol] ?? STOCK_NAMES[symbol];
  if (!name) throw new Error(`no name for quote ${symbol}`);
  return { symbol, price: Number(price), currency: 'USD', name, source: 'seed', asOf: date, stale: true };
});

// ---- crypto ----
const prices = lines('crypto.txt').map((l) => {
  const [id, usd] = l.split('|');
  return { id, usd: Number(usd) };
});

const write = (p, obj) => writeFileSync(join(root, p), JSON.stringify(obj, null, 2) + '\n');
write('data/seed/fund-profiles.json', { capturedAt: CAPTURED_AT, profiles });
write('data/seed/quotes.json', { capturedAt: CAPTURED_AT, quotes });
write('data/seed/crypto.json', { capturedAt: CAPTURED_AT, prices });
writeFileSync(join(here, 'coverage.json'), JSON.stringify(coverageRows, null, 2) + '\n');
console.log(`profiles=${profiles.length} quotes=${quotes.length} crypto=${prices.length}`);

// ---- starter pack CSV -> TS string module (so the sample works client-side, no fs) ----
const csv = readFileSync(join(root, 'data/starter-pack-portfolio_holdings.csv'), 'utf8');
writeFileSync(
  join(root, 'lib/samples/starter-pack.ts'),
  `/**\n * GENERATED by scripts/seed/build.mjs from data/starter-pack-portfolio_holdings.csv. Do not edit.\n * Explicitly synthetic RedHawk Builds starter-pack data (every row has synthetic=true).\n */\nexport const STARTER_PACK_CSV: string = ${JSON.stringify(csv)};\n\nexport const STARTER_PACK_FILENAME = 'starter-pack-portfolio_holdings.csv';\n`,
);
