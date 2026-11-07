import { describe, expect, it } from 'vitest';
import { floorPct, fmtPctBound } from './format';

describe('fmtPctBound', () => {
  it('floors lower bounds to the displayed precision, never rounding up', () => {
    expect(fmtPctBound(0.4968, true, 0)).toBe('≥ 49%');
    expect(fmtPctBound(0.4968, true, 1)).toBe('≥ 49.6%');
    expect(fmtPctBound(0.29, true, 0)).toBe('≥ 29%');
    expect(fmtPctBound(0.5, true, 0)).toBe('≥ 50%');
  });
  it('rounds normally when the value is exact', () => {
    expect(fmtPctBound(0.4968, false, 0)).toBe('50%');
    expect(fmtPctBound(null, true)).toBe('unknown');
  });
  it('floorPct absorbs float noise', () => {
    expect(floorPct(0.29, 1)).toBeCloseTo(0.29, 10);
  });
});
