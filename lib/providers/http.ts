import { ProviderError } from './types';

/** ProviderError carrying the HTTP status so the retry policy can tell 429/5xx from other 4xx. */
export class HttpProviderError extends ProviderError {
  constructor(provider: string, public status: number) {
    super(
      provider,
      `HTTP ${status}`,
      status === 429 ? 'rate_limited' : status === 404 ? 'not_found' : status >= 500 ? 'unavailable' : 'invalid_response',
    );
    this.name = 'HttpProviderError';
  }
}

/**
 * GET JSON. Error messages never include the URL (it may carry an API key in the query string).
 */
export async function fetchJson(
  provider: string,
  url: string,
  init: { headers?: Record<string, string>; signal?: AbortSignal; fetchImpl?: typeof fetch } = {},
): Promise<unknown> {
  const f = init.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await f(url, { headers: { accept: 'application/json', ...init.headers }, signal: init.signal, cache: 'no-store' });
  } catch (err) {
    if (init.signal?.aborted) throw new ProviderError(provider, 'request aborted (timeout)', 'timeout');
    const msg = err instanceof Error ? err.name : 'network error';
    throw new ProviderError(provider, `network error (${msg})`, 'unavailable');
  }
  if (!res.ok) throw new HttpProviderError(provider, res.status);
  try {
    return (await res.json()) as unknown;
  } catch {
    throw new ProviderError(provider, 'response was not valid JSON', 'invalid_response');
  }
}
