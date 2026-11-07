import { describe, expect, it } from 'vitest';
import {
  SAMPLE_PORTFOLIOS,
  STARTER_PACK_CSV,
  loadStarterPackPortfolio,
  parseCsv,
  parseStarterPackHoldings,
} from './index';

const HEADER =
  '"record_id","account_id","security_id","sector","currency","market_value_usd","annual_fee_bps","as_of_date","synthetic"';

describe('SAMPLE_PORTFOLIOS', () => {
  it('has the required samples with dollar values and unique ids', () => {
    const names = SAMPLE_PORTFOLIOS.map((s) => s.name);
    expect(names).toContain('Three S&P 500 funds + a tech ETF');
    expect(names).toContain('Classic 60/40');
    expect(names).toContain('Crypto + ETFs');
    expect(SAMPLE_PORTFOLIOS.some((s) => s.portfolio.advisoryFee?.kind === 'flat')).toBe(true);
    const ids = SAMPLE_PORTFOLIOS.flatMap((s) => s.portfolio.positions.map((p) => p.id));
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of SAMPLE_PORTFOLIOS) {
      for (const p of s.portfolio.positions) {
        expect(p.value).toBeGreaterThan(0);
        expect(p.quantity).toBeUndefined();
      }
    }
  });
});

describe('parseCsv', () => {
  it('handles quotes, escaped quotes, commas and CRLF', () => {
    expect(parseCsv('a,"b,c","d""e"\r\n1,2,3\n')).toEqual([
      ['a', 'b,c', 'd"e'],
      ['1', '2', '3'],
    ]);
  });
});

describe('parseStarterPackHoldings', () => {
  it('maps one valid row to a synthetic equity position', () => {
    const csv = `${HEADER}\n"HOLD-001","ACCT-2","SYNTH-002","Healthcare","USD","1079.31","20","2026-09-30","true"\n`;
    const r = parseStarterPackHoldings(csv);
    expect(r.errors).toEqual([]);
    expect(r.sourceRows).toBe(1);
    expect(r.portfolio.positions).toEqual([
      {
        id: 'starter-HOLD-001',
        symbol: 'SYNTH-002',
        assetClass: 'equity',
        value: 1079.31,
        account: 'ACCT-2',
        sector: 'Health Care',
        name: 'SYNTH-002',
        synthetic: true,
        feeOverrides: { expenseRatio: 0.002 },
      },
    ]);
  });

  it('rejects blank, invalid and non-USD rows with explicit errors (never 0)', () => {
    const csv = [
      HEADER,
      '"HOLD-A","ACCT-1","SYNTH-001","Technology","USD","","5","2026-09-30","true"',
      '"HOLD-B","ACCT-1","SYNTH-001","Technology","USD","abc","5","2026-09-30","true"',
      '"HOLD-C","ACCT-1","SYNTH-001","Technology","EUR","100","5","2026-09-30","true"',
      '"HOLD-D","ACCT-1","SYNTH-001","Technology","USD","-5","5","2026-09-30","true"',
      '"HOLD-E","ACCT-1","SYNTH-001","Technology","USD","250.5","x","2026-09-30","true"',
      '"HOLD-F","ACCT-1","SYNTH-001","Technology","USD","10","","2026-09-30","true"',
    ].join('\n');
    const r = parseStarterPackHoldings(csv);
    expect(r.sourceRows).toBe(6);
    expect(r.portfolio.positions.map((p) => p.id)).toEqual(['starter-HOLD-E', 'starter-HOLD-F']);
    expect(r.portfolio.positions.every((p) => (p.value ?? 0) > 0)).toBe(true);
    // invalid / blank fee -> no override (unknown), never 0
    expect(r.portfolio.positions[0].feeOverrides).toBeUndefined();
    expect(r.portfolio.positions[1].feeOverrides).toBeUndefined();
    const byRecord = Object.fromEntries(r.errors.map((e) => [e.recordId, e]));
    expect(byRecord['HOLD-A'].field).toBe('market_value_usd');
    expect(byRecord['HOLD-A'].message).toMatch(/Missing/);
    expect(byRecord['HOLD-B'].field).toBe('market_value_usd');
    expect(byRecord['HOLD-C'].field).toBe('currency');
    expect(byRecord['HOLD-D'].field).toBe('market_value_usd');
    expect(byRecord['HOLD-E'].field).toBe('annual_fee_bps');
    expect(byRecord['HOLD-A'].line).toBe(2);
  });

  it('reports missing columns', () => {
    const r = parseStarterPackHoldings('"record_id","currency"\n"X","USD"\n');
    expect(r.portfolio.positions).toHaveLength(0);
    expect(r.errors.some((e) => e.field === 'header' && /market_value_usd/.test(e.message))).toBe(true);
  });

  it('reconciles: per-account totals of market_value_usd equal the parsed values', () => {
    const lines = STARTER_PACK_CSV.split(/\r?\n/).filter(Boolean).slice(1);
    const expected = new Map<string, number>();
    for (const l of lines) {
      const cells = l.split(',').map((c) => c.replace(/^"|"$/g, ''));
      expected.set(cells[1], (expected.get(cells[1]) ?? 0) + Number(cells[5]));
    }
    const r = loadStarterPackPortfolio();
    expect(r.errors).toEqual([]);
    expect(r.sourceRows).toBe(lines.length);
    expect(r.portfolio.positions).toHaveLength(lines.length);
    const parsed = new Map<string, number>();
    for (const p of r.portfolio.positions) parsed.set(p.account ?? '', (parsed.get(p.account ?? '') ?? 0) + (p.value ?? 0));
    expect([...parsed.keys()].sort()).toEqual([...expected.keys()].sort());
    for (const [acct, total] of expected) expect(parsed.get(acct)).toBeCloseTo(total, 6);
    for (const p of r.portfolio.positions) {
      expect(p.synthetic).toBe(true);
      expect(['Information Technology', 'Health Care', 'Industrials', 'Financials', 'Energy']).toContain(p.sector);
    }
  });
});
