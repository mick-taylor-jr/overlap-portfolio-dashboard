import type { Component } from '@/lib/hooks/use-portfolio-analysis';

/** Fixed categorical order (validated palette). Slot 8 is not used so "Other" stays neutral. */
const SLOTS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)', 'var(--chart-6)', 'var(--chart-7)'];
export const OTHER_COLOR = 'var(--chart-other)';
export const OTHER_LABEL = 'Other positions';

export interface ComponentColors {
  colorOf: (symbol: string) => string;
  /** Legend entries in slot order; the tail beyond 7 folds into "Other positions". */
  legend: { symbol: string; color: string }[];
  hasOther: boolean;
}

/**
 * Color follows the entity (portfolio component), assigned once by component value so that
 * toggles and filters never repaint survivors.
 */
export function componentColors(components: Component[]): ComponentColors {
  const ordered = [...components].sort((a, b) => (b.value ?? -1) - (a.value ?? -1) || a.symbol.localeCompare(b.symbol));
  const map = new Map<string, string>();
  ordered.forEach((c, i) => map.set(c.symbol, i < SLOTS.length ? SLOTS[i] : OTHER_COLOR));
  const legend = ordered.slice(0, SLOTS.length).map((c, i) => ({ symbol: c.symbol, color: SLOTS[i] }));
  return { colorOf: (s) => map.get(s) ?? OTHER_COLOR, legend, hasOther: ordered.length > SLOTS.length };
}
