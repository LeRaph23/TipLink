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

const DAY = 86_400_000;

/** Milliseconds Paris is ahead of UTC at `at`. */
function parisOffsetMs(at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Paris', hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(at);
  const n = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'), n('second')) - Math.floor(at.getTime() / 1000) * 1000;
}

/** Last Monday-to-Monday week in Paris, as UTC instants. */
export function lastParisWeek(now: Date): { start: Date; end: Date } {
  const local = new Date(now.getTime() + parisOffsetMs(now));
  const dow = (local.getUTCDay() + 6) % 7; // Monday = 0
  const mondayLocal = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - dow);
  const toUtc = (localMidnight: number) => new Date(localMidnight - parisOffsetMs(new Date(localMidnight)));
  return { start: toUtc(mondayLocal - 7 * DAY), end: toUtc(mondayLocal) };
}

export function weekLabel(start: Date, end: Date, locale: string): string {
  const en = locale.startsWith('en');
  const fmt = new Intl.DateTimeFormat(en ? 'en-GB' : 'fr-FR', { day: 'numeric', month: 'long', timeZone: 'Europe/Paris' });
  const last = new Date(end.getTime() - 1);
  return en ? `of ${fmt.format(start)} to ${fmt.format(last)}` : `du ${fmt.format(start)} au ${fmt.format(last)}`;
}
