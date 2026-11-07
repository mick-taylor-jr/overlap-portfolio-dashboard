/**
 * Fee schedule comparison (spec 5.6). No return prediction: every schedule gets the SAME starting
 * balance, contributions, gross return and horizon.
 *
 * Yearly simulation, for t = 0..T−1:
 *   e_t       = fundRate + otherRecurringRate + effectiveRate(balance_t, advisory)
 *   fee_t     = balance_t × e_t
 *   balance_{t+1} = balance_t × (1 + r − e_t) + C        (end-of-year contribution)
 * With flat rates this equals fv(P, C, r − e, T). cumulativeFees = Σ fee_t.
 * Advisory tiers are evaluated on max(0, balance_t).
 *
 * Output order: returns outer, horizons inner.
 */
import type { FeeSchedule, ScheduleComparisonPoint } from './contracts';
import { assertFinite, assertNonNegative, assertNonNegativeInteger } from './guards';
import { effectiveRate } from './advisory';

export function compareSchedules(
  schedules: FeeSchedule[],
  opts: { P: number; C: number; returns: number[]; horizons: number[] },
): ScheduleComparisonPoint[] {
  const { P, C, returns, horizons } = opts;
  assertNonNegative(P, 'P');
  assertNonNegative(C, 'C');
  returns.forEach((r, i) => assertFinite(r, `returns[${i}]`));
  horizons.forEach((T, i) => assertNonNegativeInteger(T, `horizons[${i}]`));
  const ids = new Set<string>();
  for (const s of schedules) {
    if (ids.has(s.id)) throw new RangeError(`duplicate schedule id ${s.id}`);
    ids.add(s.id);
    assertNonNegative(s.fundRate, `fundRate of ${s.id}`);
    assertNonNegative(s.otherRecurringRate ?? 0, `otherRecurringRate of ${s.id}`);
    effectiveRate(0, s.advisory); // validates the advisory schedule up front
  }
  const maxT = horizons.reduce((m, T) => Math.max(m, T), 0);

  const points: ScheduleComparisonPoint[] = [];
  for (const r of returns) {
    // balances[id][t], fees[id][t] = cumulative after t years
    const sims = new Map<string, { bal: number[]; cum: number[] }>();
    for (const s of schedules) {
      const bal = [P];
      const cum = [0];
      let b = P;
      let f = 0;
      for (let t = 0; t < maxT; t++) {
        const e = s.fundRate + (s.otherRecurringRate ?? 0) + effectiveRate(Math.max(0, b), s.advisory);
        f += b * e;
        b = b * (1 + r - e) + C;
        bal.push(b);
        cum.push(f);
      }
      sims.set(s.id, { bal, cum });
    }
    for (const T of horizons) {
      const ending: Record<string, number> = {};
      const cumulativeFees: Record<string, number> = {};
      for (const [id, sim] of sims) {
        ending[id] = sim.bal[T];
        cumulativeFees[id] = sim.cum[T];
      }
      points.push({ r, T, ending, cumulativeFees });
    }
  }
  return points;
}
