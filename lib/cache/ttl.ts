/** TTLs in seconds. */
export const TTL = {
  quoteMarketHours: 5 * 60,
  quoteOffHours: 60 * 60,
  crypto: 90,
  fundProfile: 7 * 24 * 3600,
  search: 24 * 3600,
} as const;

/** How long the store keeps entries for the "last cached value" fallback. */
export const KEEP = {
  quote: 7 * 24 * 3600,
  crypto: 7 * 24 * 3600,
  fundProfile: 30 * 24 * 3600,
  search: 7 * 24 * 3600,
  cryptoId: 30 * 24 * 3600,
} as const;

const nyParts = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/**
 * US regular session: Mon-Fri 09:30-16:00 America/New_York (DST-aware via Intl).
 * Exchange holidays are NOT modeled; on a holiday we just refresh more often than needed.
 */
export function isUsMarketOpen(at: Date = new Date()): boolean {
  const parts = Object.fromEntries(nyParts.formatToParts(at).map((p) => [p.type, p.value]));
  const wd = parts.weekday;
  if (wd === 'Sat' || wd === 'Sun') return false;
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  return minutes >= 9 * 60 + 30 && minutes < 16 * 60;
}

export function quoteTtlSeconds(at: Date = new Date()): number {
  return isUsMarketOpen(at) ? TTL.quoteMarketHours : TTL.quoteOffHours;
}
