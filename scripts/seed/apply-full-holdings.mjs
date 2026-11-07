// Replaces top-N seed holdings with full issuer holdings for funds in scripts/seed/full-holdings/.
// Usage: node scripts/seed/apply-full-holdings.mjs
import fs from 'node:fs';
const norm = (t) => t.trim().toUpperCase().replace(/[ ./]+/g, '-');
const seedPath = 'data/seed/fund-profiles.json';
const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
const dir = 'scripts/seed/full-holdings';
const ivvNames = new Map();
const parse = (sym) => {
  const lines = fs.readFileSync(`${dir}/${sym}.txt`, 'utf8').split('\n').filter((l) => l && !l.startsWith('#'));
  if (lines[0].includes('|')) return lines.map((l) => { const [t, n, w] = l.split('|'); ivvNames.set(norm(t), n); return { symbol: norm(t), name: n, weight: +w }; });
  return lines.join(',').split(',').filter(Boolean).map((x) => { const [t, w] = x.split(':'); return { symbol: norm(t), name: '', weight: +w / 1e6 }; });
};
const META = {
  IVV: { source: 'iShares latest-holdings.csv (ishares.com)', asOf: '2026-11-05' },
  SPY: { source: 'SSGA holdings-daily-us-en-spy.xlsx (ssga.com)', asOf: '2026-11-05' },
};
const parsed = Object.fromEntries(Object.keys(META).map((s) => [s, parse(s)]));
for (const [sym, holdings] of Object.entries(parsed)) {
  const p = seed.profiles.find((x) => x.symbol === sym);
  const oldNames = new Map(p.holdings.map((h) => [h.symbol, h.name]));
  p.holdings = holdings
    .filter((h) => h.weight > 0)
    .map((h) => ({ symbol: h.symbol, name: oldNames.get(h.symbol) || h.name || ivvNames.get(h.symbol) || h.symbol, weight: h.weight }));
  p.holdingsCoverage = Math.min(1, +p.holdings.reduce((s, h) => s + h.weight, 0).toFixed(6));
  p.totalHoldingsCount = p.holdings.length;
  p.holdingsSource = META[sym];
  console.log(sym, p.holdings.length, p.holdingsCoverage);
}
fs.writeFileSync(seedPath, JSON.stringify(seed, null, 2) + '\n');
// Overlap check
const ov = (a, b) => { const m = new Map(b.map((h) => [h.symbol, h.weight])); return a.reduce((s, h) => s + Math.min(h.weight, m.get(h.symbol) ?? 0), 0); };
const g = (s) => seed.profiles.find((x) => x.symbol === s).holdings;
console.log('overlap SPY/IVV', ov(g('SPY'), g('IVV')).toFixed(4), 'SPY/VOO', ov(g('SPY'), g('VOO')).toFixed(4), 'IVV/QQQ', ov(g('IVV'), g('QQQ')).toFixed(4));
