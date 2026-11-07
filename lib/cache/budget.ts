import type { Cache } from './types';

export interface BudgetStatus {
  used: number;
  limit: number;
  remaining: number;
  /** ISO timestamp of the next UTC midnight. */
  resetsAt: string;
}

export type BudgetDecision =
  | { ok: true; status: BudgetStatus }
  | { ok: false; reason: 'daily_reserve' | 'per_minute'; status: BudgetStatus };

export interface BudgetOptions {
  dailyLimit?: number;
  /** Refuse once remaining <= reserve. */
  reserve?: number;
  perMinute?: number;
  now?: () => number;
}

const utcDay = (t: number) => new Date(t).toISOString().slice(0, 10);
const nextUtcMidnight = (t: number) => {
  const d = new Date(t);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
};

function intEnv(v: string | undefined, fallback: number): number {
  const n = v === undefined ? NaN : Number.parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/**
 * Alpha Vantage request budget, persisted in the shared cache so it holds across serverless
 * instances when Upstash is configured. Daily counter keyed by UTC date (so it resets at UTC
 * midnight), plus a per-minute limiter. Counters are incremented atomically *before* the call
 * and refunded when the call is refused, so concurrent requests cannot overshoot.
 */
export class AlphaVantageBudget {
  readonly dailyLimit: number;
  readonly reserve: number;
  readonly perMinute: number;
  private now: () => number;

  constructor(private cache: Cache, opts: BudgetOptions = {}) {
    this.dailyLimit = opts.dailyLimit ?? 25;
    this.reserve = opts.reserve ?? 2;
    this.perMinute = opts.perMinute ?? 5;
    this.now = opts.now ?? Date.now;
  }

  static fromEnv(cache: Cache, env: NodeJS.ProcessEnv = process.env, now?: () => number): AlphaVantageBudget {
    return new AlphaVantageBudget(cache, {
      dailyLimit: intEnv(env.ALPHA_VANTAGE_DAILY_BUDGET, 25),
      perMinute: intEnv(env.ALPHA_VANTAGE_PER_MINUTE, 5),
      reserve: 2,
      now,
    });
  }

  private dayKey(t: number) {
    return `av:budget:${utcDay(t)}`;
  }
  private minuteKey(t: number) {
    return `av:minute:${Math.floor(t / 60_000)}`;
  }
  private secondsToMidnight(t: number) {
    return Math.ceil((nextUtcMidnight(t) - t) / 1000) + 60;
  }

  private toStatus(used: number, t: number): BudgetStatus {
    return {
      used,
      limit: this.dailyLimit,
      remaining: Math.max(0, this.dailyLimit - used),
      resetsAt: new Date(nextUtcMidnight(t)).toISOString(),
    };
  }

  async status(): Promise<BudgetStatus> {
    const t = this.now();
    return this.toStatus(await this.cache.getCounter(this.dayKey(t)), t);
  }

  /** True when a call would currently be allowed (does not consume). */
  async canSpend(): Promise<boolean> {
    const t = this.now();
    const used = await this.cache.getCounter(this.dayKey(t));
    if (this.dailyLimit - used <= this.reserve) return false;
    const minute = await this.cache.getCounter(this.minuteKey(t));
    return minute < this.perMinute;
  }

  /** Reserve one request. Refuses when remaining <= reserve or the per-minute limit is hit. */
  async tryConsume(): Promise<BudgetDecision> {
    const t = this.now();
    const dayKey = this.dayKey(t);
    const minKey = this.minuteKey(t);

    const minuteCount = await this.cache.incr(minKey, 1, 120);
    if (minuteCount > this.perMinute) {
      await this.cache.incr(minKey, -1, 120);
      return { ok: false, reason: 'per_minute', status: await this.status() };
    }
    const used = await this.cache.incr(dayKey, 1, this.secondsToMidnight(t));
    // `used - 1` was the count before this request; refuse if remaining was already <= reserve.
    if (this.dailyLimit - (used - 1) <= this.reserve) {
      await this.cache.incr(dayKey, -1, this.secondsToMidnight(t));
      await this.cache.incr(minKey, -1, 120);
      return { ok: false, reason: 'daily_reserve', status: this.toStatus(used - 1, t) };
    }
    return { ok: true, status: this.toStatus(used, t) };
  }

  /** Alpha Vantage told us the daily limit is spent: stop calling until UTC midnight. */
  async markExhausted(): Promise<void> {
    const t = this.now();
    const key = this.dayKey(t);
    const used = await this.cache.getCounter(key);
    if (used < this.dailyLimit) await this.cache.incr(key, this.dailyLimit - used, this.secondsToMidnight(t));
  }
}
