'use client';

import { useMemo } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  cryptoResponseSchema,
  fundProfileResponseSchema,
  healthResponseSchema,
  quoteResponseSchema,
  searchResponseSchema,
  type HealthResponse,
} from '@/lib/api-contracts';
import type { FundProfile, Quote, SymbolSearchResult } from '@/lib/types';
import type { CryptoPrice } from '@/lib/providers/types';
import { chunk, fetchJson, uniqSorted } from './fetch-json';

const MAX_PER_REQUEST = 50;

export interface BatchResult<T> {
  /** symbol -> value; null = the server answered "no data" for that symbol. Missing key = not loaded yet. */
  data: Record<string, T | null>;
  errors: Record<string, string>;
  isLoading: boolean;
  isFetching: boolean;
  /** Whole-request failure (network, 5xx, bad shape). Per-symbol failures live in `errors`. */
  error: Error | null;
  refetch: () => void;
}

function useBatch<T>(
  kind: string,
  ids: readonly string[],
  load: (batch: string[], signal: AbortSignal) => Promise<{ data: Record<string, T | null>; errors: Record<string, string> }>,
  staleTime: number,
): BatchResult<T> {
  const list = uniqSorted(ids);
  const q = useQuery({
    queryKey: [kind, list],
    enabled: list.length > 0,
    staleTime,
    placeholderData: keepPreviousData,
    retry: 1,
    queryFn: async ({ signal }) => {
      const parts = await Promise.all(chunk(list, MAX_PER_REQUEST).map((b) => load(b, signal)));
      return parts.reduce(
        (acc, p) => ({ data: { ...acc.data, ...p.data }, errors: { ...acc.errors, ...p.errors } }),
        { data: {} as Record<string, T | null>, errors: {} as Record<string, string> },
      );
    },
  });
  const { data, isPending, isFetching, error, refetch } = q;
  const enabled = list.length > 0;
  // Stable identity so downstream useMemo only recomputes when the data actually changes.
  return useMemo(
    () => ({
      data: data?.data ?? EMPTY,
      errors: data?.errors ?? EMPTY_ERR,
      isLoading: enabled && isPending,
      isFetching,
      error,
      refetch: () => void refetch(),
    }),
    [data, enabled, isPending, isFetching, error, refetch],
  ) as BatchResult<T>;
}

const EMPTY: Record<string, never> = {};
const EMPTY_ERR: Record<string, string> = {};

/** Quotes for stocks / ETFs / mutual funds. GET /api/quote?symbols= */
export function useQuotes(symbols: readonly string[]): BatchResult<Quote> {
  return useBatch<Quote>(
    'quotes',
    symbols,
    async (b, signal) => {
      const r = await fetchJson(`/api/quote?symbols=${encodeURIComponent(b.join(','))}`, quoteResponseSchema, signal);
      return { data: r.quotes, errors: r.errors };
    },
    5 * 60_000,
  );
}

/** Fund profiles (expense ratio, holdings, sectors). GET /api/fund-profile?symbols= */
export function useFundProfiles(symbols: readonly string[]): BatchResult<FundProfile> {
  return useBatch<FundProfile>(
    'fund-profiles',
    symbols,
    async (b, signal) => {
      const r = await fetchJson(`/api/fund-profile?symbols=${encodeURIComponent(b.join(','))}`, fundProfileResponseSchema, signal);
      return { data: r.profiles, errors: r.errors };
    },
    60 * 60_000,
  );
}

/** Crypto prices by CoinGecko id. GET /api/crypto?ids= */
export function useCryptoPrices(ids: readonly string[]): BatchResult<CryptoPrice> {
  return useBatch<CryptoPrice>(
    'crypto',
    ids,
    async (b, signal) => {
      const r = await fetchJson(`/api/crypto?ids=${encodeURIComponent(b.join(','))}`, cryptoResponseSchema, signal);
      return { data: r.prices, errors: r.errors };
    },
    90_000,
  );
}

/** Symbol autocomplete. Caller debounces `q`. GET /api/search?q= */
export function useSearch(q: string) {
  const term = q.trim();
  return useQuery<SymbolSearchResult[]>({
    queryKey: ['search', term.toLowerCase()],
    enabled: term.length >= 1,
    staleTime: 24 * 60 * 60_000,
    placeholderData: keepPreviousData,
    retry: 0,
    queryFn: async ({ signal }) => (await fetchJson(`/api/search?q=${encodeURIComponent(term)}`, searchResponseSchema, signal)).results,
  });
}

/** Provider status and data mode. GET /api/health */
export function useHealth() {
  return useQuery<HealthResponse>({
    queryKey: ['health'],
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    retry: 1,
    queryFn: ({ signal }) => fetchJson('/api/health', healthResponseSchema, signal),
  });
}
