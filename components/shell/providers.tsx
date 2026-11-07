'use client';

import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PortfolioProvider } from '@/lib/portfolio/context';

let browserQueryClient: QueryClient | undefined;

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { refetchOnWindowFocus: false, gcTime: 30 * 60_000 } },
  });
}

function getQueryClient() {
  // Isolate server renders; reuse one client in the browser.
  if (typeof window === 'undefined') return makeClient();
  browserQueryClient ??= makeClient();
  return browserQueryClient;
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={getQueryClient()}>
      <PortfolioProvider>{children}</PortfolioProvider>
    </QueryClientProvider>
  );
}

/** Data fetching only (no portfolio state): used by the methodology page's live provider status. */
export function QueryProvider({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={getQueryClient()}>{children}</QueryClientProvider>;
}
