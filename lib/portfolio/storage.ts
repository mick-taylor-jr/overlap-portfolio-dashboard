import type { PortfolioState } from './state';
import { parseState } from './schema';

const KEY = 'overlap:v1';

/** Every storage access is guarded: private mode, quota and disabled storage must not break the app. */
export function loadState(): PortfolioState | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    return parseState(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveState(state: PortfolioState): boolean {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function clearState(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable: nothing to clear */
  }
}
