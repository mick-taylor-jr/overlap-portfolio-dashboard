'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type Dispatch, type ReactNode } from 'react';
import type { Portfolio } from '@/lib/types';
import { reducer, type PortfolioAction } from './reducer';
import { decodeShareHash, hasShareHash } from './share';
import { initialState, SHARE_NOTIONAL, type PortfolioState } from './state';
import { loadState, saveState } from './storage';
import { fmtUsd } from '@/lib/format';

export interface Notice {
  id: number;
  tone: 'info' | 'warning' | 'danger' | 'success';
  text: string;
}

interface Ctx {
  state: PortfolioState;
  dispatch: Dispatch<PortfolioAction>;
  /** false until localStorage / share hash have been read (avoids a flash of the empty state). */
  hydrated: boolean;
  /** false when localStorage is unavailable (private mode, quota): edits won't survive a reload. */
  persistent: boolean;
  notice: Notice | null;
  notify: (tone: Notice['tone'], text: string) => void;
  dismissNotice: () => void;
  loadPortfolio: (p: Portfolio, message?: string) => void;
}

const PortfolioContext = createContext<Ctx | null>(null);

export function PortfolioProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const [hydrated, setHydrated] = useState(false);
  const [persistent, setPersistent] = useState(true);
  const [notice, setNotice] = useState<Notice | null>(null);
  const seq = useRef(0);

  const notify = useCallback((tone: Notice['tone'], text: string) => {
    seq.current += 1;
    setNotice({ id: seq.current, tone, text });
  }, []);

  const applyHash = useCallback(() => {
    const hash = window.location.hash;
    if (!hasShareHash(hash)) return false;
    const res = decodeShareHash(hash);
    // Drop the hash so later edits are not confused with the shared snapshot.
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    if ('error' in res) {
      notify('danger', res.error);
      return false;
    }
    dispatch({ type: 'replace', portfolio: res.portfolio });
    notify(
      'info',
      `Loaded a shared portfolio. Share links carry tickers, weights and fee settings but no share counts or dollar amounts, so positions are scaled to a ${fmtUsd(SHARE_NOTIONAL)} notional. Edit amounts to match your own holdings.`,
    );
    return true;
  }, [notify]);

  // Hydrate once on mount: share hash wins over the saved portfolio (but keeps saved preferences).
  useEffect(() => {
    const saved = loadState();
    if (saved) dispatch({ type: 'hydrate', state: saved });
    applyHash();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydration from browser-only storage
    setHydrated(true);
    const onHash = () => applyHash();
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [applyHash]);

  useEffect(() => {
    if (!hydrated) return;
    const t = window.setTimeout(() => setPersistent(saveState(state)), 250);
    return () => window.clearTimeout(t);
  }, [state, hydrated]);

  const loadPortfolio = useCallback(
    (p: Portfolio, message?: string) => {
      dispatch({ type: 'replace', portfolio: p });
      if (message) notify('info', message);
    },
    [notify],
  );

  const value = useMemo<Ctx>(
    () => ({ state, dispatch, hydrated, persistent, notice, notify, dismissNotice: () => setNotice(null), loadPortfolio }),
    [state, hydrated, persistent, notice, notify, loadPortfolio],
  );
  return <PortfolioContext.Provider value={value}>{children}</PortfolioContext.Provider>;
}

export function usePortfolio(): Ctx {
  const ctx = useContext(PortfolioContext);
  if (!ctx) throw new Error('usePortfolio must be used inside <PortfolioProvider>');
  return ctx;
}
