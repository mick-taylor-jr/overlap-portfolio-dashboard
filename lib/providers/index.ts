/** Server-only entry point: the default, env-wired provider chain. */
import { getCache } from '@/lib/cache';
import { AlphaVantageBudget } from '@/lib/cache/budget';
import { AlphaVantageProvider } from './alphavantage';
import { CoinGeckoProvider } from './coingecko';
import { YahooProvider } from './yahoo';
import { seedSource } from './seed';
import { alphaVantageKey, coinGeckoKey } from './env';
import { ProviderChain } from './chain';

export { ProviderChain, type ChainDeps, type CallOptions, type BatchResult, type WarmReport } from './chain';
export { ProviderError } from './types';

let chain: ProviderChain | null = null;

/** Built once per server instance. Keys are read from process.env here and never leave the server. */
export function getChain(): ProviderChain {
  if (chain) return chain;
  const cache = getCache();
  const budget = AlphaVantageBudget.fromEnv(cache);
  const avKey = alphaVantageKey();
  const cgKey = coinGeckoKey();
  chain = new ProviderChain({
    cache,
    budget,
    seed: seedSource,
    yahoo: new YahooProvider(),
    alphavantage: avKey ? new AlphaVantageProvider({ apiKey: avKey, budget }) : undefined,
    coingecko: cgKey ? new CoinGeckoProvider({ apiKey: cgKey }) : undefined,
  });
  return chain;
}

export function resetChainForTests(): void {
  chain = null;
}
