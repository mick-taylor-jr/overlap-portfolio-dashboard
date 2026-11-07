import type { z } from 'zod';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number | null,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * GET a same-origin API route and validate the body with its Zod contract.
 * Only symbols / coin ids are ever put in the query string: never quantities or values.
 */
export async function fetchJson<S extends z.ZodType>(url: string, schema: S, signal?: AbortSignal): Promise<z.infer<S>> {
  let res: Response;
  try {
    res = await fetch(url, { signal, headers: { accept: 'application/json' } });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    throw new ApiError('Network error: the data service could not be reached.', null);
  }
  if (!res.ok) throw new ApiError(`The data service answered ${res.status}.`, res.status);
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new ApiError('The data service returned a response that is not JSON.', res.status);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new ApiError('The data service returned data in an unexpected shape.', res.status);
  return parsed.data;
}

/** Stable, de-duplicated, sorted list so query keys don't churn with row order. */
export function uniqSorted(xs: readonly string[]): string[] {
  return [...new Set(xs.filter(Boolean))].sort();
}

export function chunk<T>(xs: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size));
  return out;
}
