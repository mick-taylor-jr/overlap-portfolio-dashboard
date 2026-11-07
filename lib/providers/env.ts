/** Server-only provider configuration. Keys are read from process.env and never logged or returned. */
export type ProviderName = 'yahoo' | 'alphavantage' | 'coingecko';
export const PROVIDER_NAMES: ProviderName[] = ['yahoo', 'alphavantage', 'coingecko'];

/** OVERLAP_DISABLE_PROVIDERS=yahoo,alphavantage,coingecko  (failure injection / kill switch). */
export function disabledProviders(env: NodeJS.ProcessEnv = process.env): Set<ProviderName> {
  const raw = env.OVERLAP_DISABLE_PROVIDERS ?? '';
  const out = new Set<ProviderName>();
  for (const part of raw.split(',')) {
    const p = part.trim().toLowerCase();
    if ((PROVIDER_NAMES as string[]).includes(p)) out.add(p as ProviderName);
  }
  return out;
}

export function alphaVantageKey(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return env.ALPHA_VANTAGE_API_KEY?.trim() || undefined;
}

export function coinGeckoKey(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return env.COINGECKO_API_KEY?.trim() || undefined;
}

/** Whether the provider has what it needs (yahoo-finance2 needs no key). */
export function hasCredentials(name: ProviderName, env: NodeJS.ProcessEnv = process.env): boolean {
  if (name === 'yahoo') return true;
  if (name === 'alphavantage') return Boolean(alphaVantageKey(env));
  return Boolean(coinGeckoKey(env));
}

export function isEnabled(name: ProviderName, env: NodeJS.ProcessEnv = process.env): boolean {
  return hasCredentials(name, env) && !disabledProviders(env).has(name);
}
