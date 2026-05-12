// Commission amounts in euro-cents per pack type
export const COMMISSION_BY_PACK = { solo: 2500, duo: 3500 } as const;

// Weekly bonus tiers — NON-cumulative: only the highest reached tier pays out.
// Ordered highest → lowest so the first match is the best tier.
export const WEEKLY_TIERS = [
  { id: 'gold',   threshold: 10, bonus: 10000, label: 'Or',     emoji: '🥇', color: '#f5c518', bg: 'rgba(245,197,24,0.12)' },
  { id: 'silver', threshold: 8,  bonus: 5000,  label: 'Argent', emoji: '🥈', color: '#a8b8c8', bg: 'rgba(168,184,200,0.12)' },
  { id: 'bronze', threshold: 5,  bonus: 2500,  label: 'Bronze', emoji: '🥉', color: '#cd7f32', bg: 'rgba(205,127,50,0.12)'  },
] as const;

export type WeeklyTier = typeof WEEKLY_TIERS[number];

// Monthly challenge — 200€ to whoever finishes #1 of the leaderboard
export const MONTHLY_CHALLENGE = {
  threshold: 15,
  bonus: 20000, // 200€ in cents
  prize: '200€ pour le #1 du classement',
} as const;

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
 * Returns the Monday 00:00 and Sunday 23:59:59 of the current week in Paris
 * local time, as UTC Date objects.
 */
export function getWeekBounds(now = new Date()): { start: Date; end: Date } {
  // Work in Europe/Paris timezone via Intl
  const tz = 'Europe/Paris';
  const fmt = (d: Date, part: 'year'|'month'|'day'|'weekday') =>
    new Intl.DateTimeFormat('fr-FR', { timeZone: tz, [part]: 'numeric' }).format(d);

  // Day of week: 0=Sun, 1=Mon … 6=Sat in Paris
  const parisDayOfWeek = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(now);
  const dowMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const dow = dowMap[parisDayOfWeek] ?? 0;
  const daysFromMonday = dow === 0 ? 6 : dow - 1;

  const monday = new Date(now.getTime() - daysFromMonday * 86400000);
  // Snap to midnight Paris time by using the date parts
  const [mDay, mMonth, mYear] = fmt(monday, 'day').split('/');
  const parisYear = parseInt(new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric' }).format(monday));
  const parisMonth = parseInt(new Intl.DateTimeFormat('en-US', { timeZone: tz, month: 'numeric' }).format(monday)) - 1;
  const parisDay = parseInt(new Intl.DateTimeFormat('en-US', { timeZone: tz, day: 'numeric' }).format(monday));

  // Paris midnight in UTC: use the offset
  const mondayMidnightParis = new Date(`${parisYear}-${String(parisMonth + 1).padStart(2, '0')}-${String(parisDay).padStart(2, '0')}T00:00:00`);
  // Convert Paris midnight to UTC
  const offset = getParisOffsetMs(mondayMidnightParis);
  const start = new Date(mondayMidnightParis.getTime() - offset);
  const end = new Date(start.getTime() + 7 * 86400000 - 1);

  return { start, end };
}

/**
 * Returns the first and last instant of the current calendar month in Paris time.
 */
export function getMonthBounds(now = new Date()): { start: Date; end: Date } {
  const tz = 'Europe/Paris';
  const year = parseInt(new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric' }).format(now));
  const month = parseInt(new Intl.DateTimeFormat('en-US', { timeZone: tz, month: 'numeric' }).format(now)) - 1;

  const firstParis = new Date(`${year}-${String(month + 1).padStart(2, '0')}-01T00:00:00`);
  const offset = getParisOffsetMs(firstParis);
  const start = new Date(firstParis.getTime() - offset);

  const lastDayOfMonth = new Date(year, month + 1, 0).getDate();
  const lastParis = new Date(`${year}-${String(month + 1).padStart(2, '0')}-${String(lastDayOfMonth).padStart(2, '0')}T23:59:59`);
  const endOffset = getParisOffsetMs(lastParis);
  const end = new Date(lastParis.getTime() - endOffset);

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

// ─── internal helper ─────────────────────────────────────────────────────────

function getParisOffsetMs(localDate: Date): number {
  // Determine UTC offset for Europe/Paris at a given local date
  // by comparing the local date string to UTC
  const utcStr = localDate.toLocaleString('en-US', { timeZone: 'UTC' });
  const parisStr = localDate.toLocaleString('en-US', { timeZone: 'Europe/Paris' });
  const utcMs = new Date(utcStr).getTime();
  const parisMs = new Date(parisStr).getTime();
  return parisMs - utcMs;
}
