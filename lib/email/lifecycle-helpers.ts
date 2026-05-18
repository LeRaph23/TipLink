// Pure, dependency-free helpers for the lifecycle email engine. Kept in their
// own module (no server-only / Stripe / env imports) so they can be unit-tested
// in isolation.

/** First whitespace-delimited token; falls back to the whole string, then `fallback`. */
export function firstNameFrom(fullName: string | null | undefined, fallback = ''): string {
  const raw = (fullName ?? '').trim();
  if (!raw) return fallback;
  const token = raw.split(/\s+/)[0];
  return token.length >= 2 ? token : raw;
}

/** ISO-8601 week bucket, e.g. "2026-W21". */
export function isoWeekBucket(d: Date): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** Fixed-width day-window bucket, e.g. dayWindowBucket(d, 30) -> "w612". */
export function dayWindowBucket(d: Date, windowDays: number): string {
  return `w${Math.floor(Math.floor(d.getTime() / 86400000) / windowDays)}`;
}
