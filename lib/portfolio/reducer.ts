import type { AdvisoryFee, FeeOverrides, FlagThresholds, Portfolio, Position } from '@/lib/types';
import type { CompareSettings, FeeAssumptions, PortfolioState, UiSchedule } from './state';
import { initialState } from './state';

export type PortfolioAction =
  | { type: 'hydrate'; state: PortfolioState }
  | { type: 'add'; positions: Position[] }
  | { type: 'update'; id: string; patch: Partial<Position> }
  /** Merge fee overrides on one position; `undefined` deletes a key, an empty result drops feeOverrides. */
  | { type: 'feeOverrides'; id: string; patch: Partial<Record<keyof FeeOverrides, number | undefined>> }
  | { type: 'remove'; id: string }
  | { type: 'replace'; portfolio: Portfolio }
  | { type: 'rename'; name: string }
  | { type: 'reset' }
  | { type: 'advisory'; fee: AdvisoryFee | undefined }
  | { type: 'thresholds'; thresholds: FlagThresholds }
  | { type: 'feeAssumptions'; patch: Partial<FeeAssumptions> }
  | { type: 'compare'; patch: Partial<Omit<CompareSettings, 'schedules'>> }
  | { type: 'schedules'; schedules: UiSchedule[] }
  | { type: 'groupByIssuer'; value: boolean };

export function reducer(state: PortfolioState, action: PortfolioAction): PortfolioState {
  switch (action.type) {
    case 'hydrate':
      return action.state;
    case 'add':
      return { ...state, portfolio: { ...state.portfolio, positions: [...state.portfolio.positions, ...action.positions] } };
    case 'update':
      return {
        ...state,
        portfolio: {
          ...state.portfolio,
          positions: state.portfolio.positions.map((p) => (p.id === action.id ? stripUndefined({ ...p, ...action.patch }) : p)),
        },
      };
    case 'feeOverrides':
      return {
        ...state,
        portfolio: {
          ...state.portfolio,
          positions: state.portfolio.positions.map((p) => {
            if (p.id !== action.id) return p;
            const fo = stripUndefined({ ...(p.feeOverrides ?? {}), ...action.patch } as FeeOverrides);
            return stripUndefined({ ...p, feeOverrides: Object.keys(fo).length ? fo : undefined });
          }),
        },
      };
    case 'remove':
      return { ...state, portfolio: { ...state.portfolio, positions: state.portfolio.positions.filter((p) => p.id !== action.id) } };
    case 'replace':
      return { ...state, portfolio: action.portfolio };
    case 'rename':
      return { ...state, portfolio: { ...state.portfolio, name: action.name } };
    case 'reset': {
      // Keep the user's display preferences; clear holdings and fee settings.
      const fresh = initialState();
      return { ...fresh, thresholds: state.thresholds, groupByIssuer: state.groupByIssuer };
    }
    case 'advisory':
      return { ...state, portfolio: stripUndefined({ ...state.portfolio, advisoryFee: action.fee }) };
    case 'thresholds':
      return { ...state, thresholds: action.thresholds };
    case 'feeAssumptions':
      return { ...state, feeAssumptions: { ...state.feeAssumptions, ...action.patch } };
    case 'compare':
      return { ...state, compare: { ...state.compare, ...action.patch } };
    case 'schedules':
      return { ...state, compare: { ...state.compare, schedules: action.schedules } };
    case 'groupByIssuer':
      return { ...state, groupByIssuer: action.value };
  }
}

/** Patching with `undefined` must delete the key (e.g. switching a row from quantity to value). */
function stripUndefined<T extends object>(o: T): T {
  const out = { ...o };
  for (const k of Object.keys(out) as (keyof T)[]) if (out[k] === undefined) delete out[k];
  return out;
}
