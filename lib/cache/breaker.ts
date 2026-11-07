import { ProviderError } from '@/lib/providers/types';

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface BreakerOptions {
  /** Consecutive failures before opening. */
  threshold?: number;
  /** Time the circuit stays open before allowing one trial call. */
  cooldownMs?: number;
  now?: () => number;
  /** Errors that should NOT count as provider failures (e.g. a symbol that does not exist). */
  isFailure?: (err: unknown) => boolean;
}

const defaultIsFailure = (err: unknown) =>
  !(err instanceof ProviderError && (err.kind === 'not_found' || err.kind === 'budget_exhausted'));

/**
 * Per-provider circuit breaker (per serverless instance). closed -> open after `threshold`
 * consecutive failures; open -> half-open after `cooldownMs`; a half-open trial success closes
 * it, a failure re-opens it. While open (or while a half-open trial is in flight) calls fail
 * fast with ProviderError('circuit_open').
 */
export class CircuitBreaker {
  private failures = 0;
  private openedAt: number | null = null;
  private trialInFlight = false;
  lastError?: string;
  lastSuccessAt?: string;
  private threshold: number;
  private cooldownMs: number;
  private now: () => number;
  private isFailure: (err: unknown) => boolean;

  constructor(public readonly name: string, opts: BreakerOptions = {}) {
    this.threshold = opts.threshold ?? 3;
    this.cooldownMs = opts.cooldownMs ?? 30_000;
    this.now = opts.now ?? Date.now;
    this.isFailure = opts.isFailure ?? defaultIsFailure;
  }

  get state(): CircuitState {
    if (this.openedAt === null) return 'closed';
    return this.now() - this.openedAt >= this.cooldownMs ? 'half-open' : 'open';
  }

  async exec<T>(fn: () => Promise<T>): Promise<T> {
    const state = this.state;
    if (state === 'open' || (state === 'half-open' && this.trialInFlight)) {
      throw new ProviderError(this.name, 'circuit open, skipping provider', 'circuit_open');
    }
    const isTrial = state === 'half-open';
    if (isTrial) this.trialInFlight = true;
    try {
      const out = await fn();
      this.failures = 0;
      this.openedAt = null;
      this.lastSuccessAt = new Date(this.now()).toISOString();
      return out;
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
      if (this.isFailure(err)) {
        this.failures += 1;
        if (isTrial || this.failures >= this.threshold) this.openedAt = this.now();
      } else if (isTrial) {
        // A "not found" still proves the provider is reachable.
        this.failures = 0;
        this.openedAt = null;
      }
      throw err;
    } finally {
      if (isTrial) this.trialInFlight = false;
    }
  }

  reset(): void {
    this.failures = 0;
    this.openedAt = null;
    this.trialInFlight = false;
    this.lastError = undefined;
  }
}
