// Commission amounts in euro-cents per pack type
export const COMMISSION_BY_PACK = { solo: 2500, duo: 3500 } as const;

// Weekly bonus tiers — NON-cumulative: only the highest reached tier pays out.
// Reduced from previous values (25/50/100€) to fund the referral program.
export const WEEKLY_TIERS = [
  { id: 'gold',   threshold: 10, bonus: 5000, label: 'Or',     emoji: '🥇', color: '#f5c518', bg: 'rgba(245,197,24,0.12)' },
  { id: 'silver', threshold: 8,  bonus: 3000, label: 'Argent', emoji: '🥈', color: '#a8b8c8', bg: 'rgba(168,184,200,0.12)' },
  { id: 'bronze', threshold: 5,  bonus: 1500, label: 'Bronze', emoji: '🥉', color: '#cd7f32', bg: 'rgba(205,127,50,0.12)'  },
] as const;

export type WeeklyTier = typeof WEEKLY_TIERS[number];

export const MONTHLY_CHALLENGE = {
  threshold: 15,
  bonus: 10000,
  prize: '100€ pour le #1 du classement',
} as const;

// Referral rewards — paid to the parrain when filleul (a) is approved by
// super-admin AND (b) completes >=3 sales. Milestones are one-shot lifetime.
export const REFERRAL_REWARDS = {
  validation:    2500,  // 25€ per validated filleul
  milestone_5:   10000, // +100€ once parrain reaches 5 validated filleuls
  milestone_10:  25000, // +250€ once parrain reaches 10 validated filleuls
} as const;

// Raised from 2 to 3: better ROI per validated filleul (3×25€ commission vs 25€ referral bonus)
export const REFERRAL_VALIDATION_MIN_SALES = 3;

// Minimum amount an ambassador can withdraw in a single payout (30€).
export const MIN_PAYOUT_CENTS = 3000;

/** Sum of weekly bonuses earned across all COMPLETED weeks (past, not the current one). */
export function computeClosedWeekBonuses(
  sales: Array<{ created_at: string }>,
  now: Date = new Date()
): number {
  const currentWeekStart = getWeekBounds(now).start.getTime();
  const buckets = new Map<number, number>(); // weekStartMs -> count

  for (const s of sales) {
    const d = new Date(s.created_at);
    if (isNaN(d.getTime())) continue;
    const weekStart = getWeekBounds(d).start.getTime();
    if (weekStart >= currentWeekStart) continue; // skip current week
    buckets.set(weekStart, (buckets.get(weekStart) ?? 0) + 1);
  }

  let total = 0;
  for (const count of buckets.values()) {
    const tier = getWeeklyTier(count);
    if (tier) total += tier.bonus;
  }
  return total;
}

/**
 * Returns the Monday 00:00 and Sunday 23:59:59 of the week containing `now`,
 * expressed in UTC, with boundaries anchored to Paris midnight.
 */
export function getWeekBounds(now = new Date()): { start: Date; end: Date } {
  const tz = 'Europe/Paris';
  const dowStr = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(now);
  const dowMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const dow = dowMap[dowStr] ?? 0;
  const daysFromMonday = dow === 0 ? 6 : dow - 1;

  // Step back to the approximate Monday, then read its Paris calendar date
  const approxMonday = new Date(now.getTime() - daysFromMonday * 86400000);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(approxMonday);
  const get = (t: string) => parseInt(parts.find(p => p.type === t)!.value);

  const start = parisMidnightUtc(get('year'), get('month'), get('day'));
  const end = new Date(start.getTime() + 7 * 86400000 - 1);
  return { start, end };
}

/**
 * Returns the first and last instant of the calendar month containing `now`,
 * expressed in UTC, with boundaries anchored to Paris midnight.
 */
export function getMonthBounds(now = new Date()): { start: Date; end: Date } {
  const tz = 'Europe/Paris';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const get = (t: string) => parseInt(parts.find(p => p.type === t)!.value);
  const year = get('year');
  const month = get('month'); // 1-indexed

  const start = parisMidnightUtc(year, month, 1);
  // Last day: Date.UTC with day=0 rolls back to the last day of the previous month (month is 1-indexed here)
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const end = new Date(parisMidnightUtc(year, month, lastDay + 1).getTime() - 1);
  return { start, end };
}

/** Returns the highest weekly tier reached, or null if below Bronze threshold. */
export function getWeeklyTier(weekSalesCount: number): WeeklyTier | null {
  return WEEKLY_TIERS.find(t => weekSalesCount >= t.threshold) ?? null;
}

/** Sum of all base commissions (cents). Bonuses are tracked/paid separately. */
export function computeTotalBaseCommission(
  sales: Array<{ commission_amount: number }>
): number {
  return sales.reduce((sum, s) => sum + s.commission_amount, 0);
}

// ─── internal helpers ─────────────────────────────────────────────────────────

/** UTC timestamp when the Paris clock shows midnight on the given Paris calendar date. */
function parisMidnightUtc(year: number, month: number, day: number): Date {
  // JS Date.UTC rolls over naturally (e.g. month=5, day=32 → June 1), which lets
  // getMonthBounds compute nextMonthStart without a separate year-wrap check.
  const approx = new Date(Date.UTC(year, month - 1, day));
  return new Date(approx.getTime() - getParisOffsetMs(approx));
}

/** How many ms ahead Europe/Paris is of UTC at the given UTC instant. */
function getParisOffsetMs(utcDate: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Paris',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(utcDate);
  const get = (t: string) => parseInt(parts.find(p => p.type === t)!.value);
  // hour12:false can return 24 for midnight in some runtimes; normalise with % 24
  const hour = get('hour') % 24;
  const parisAsUtc = Date.UTC(get('year'), get('month') - 1, get('day'), hour, get('minute'), get('second'));
  return parisAsUtc - utcDate.getTime();
}
