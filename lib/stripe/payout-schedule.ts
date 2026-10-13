import type Stripe from 'stripe';

/**
 * When Stripe pays the establishment's balance into its bank account.
 *
 * Only weekly and monthly are offered. Daily is left out on purpose: with the
 * platform setting the pricing, Connect bills Digitip per payout (0,25 % +
 * 0,10 €), so a daily schedule costs about seven times a weekly one for money
 * that is paid out to staff once a month anyway, with the payslip.
 *
 * Monthly anchors stop at 28, plus "last day": Stripe moves a 29-31 anchor to
 * the month's last day in shorter months, which a manager reading "le 30" in
 * February would not expect. Offering "last day" says it plainly.
 */
export const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export const LAST_DAY = 31;

export type PayoutSchedule =
  | { interval: 'weekly'; weekday: Weekday }
  | { interval: 'monthly'; day: number };

/** What every establishment account is created with (lib/stripe/connect.ts). */
export const DEFAULT_PAYOUT_SCHEDULE: PayoutSchedule = { interval: 'weekly', weekday: 'monday' };

function isMonthlyDay(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && ((n >= 1 && n <= 28) || n === LAST_DAY);
}

/** Validates untrusted input (a form post). Null when it is not a schedule we offer. */
export function parsePayoutSchedule(raw: unknown): PayoutSchedule | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.interval === 'weekly' && WEEKDAYS.includes(r.weekday as Weekday)) {
    return { interval: 'weekly', weekday: r.weekday as Weekday };
  }
  if (r.interval === 'monthly' && isMonthlyDay(r.day)) {
    return { interval: 'monthly', day: r.day };
  }
  return null;
}

export function toStripeSchedule(s: PayoutSchedule): Stripe.AccountUpdateParams.Settings.Payouts.Schedule {
  return s.interval === 'weekly'
    ? { interval: 'weekly', weekly_anchor: s.weekday }
    : { interval: 'monthly', monthly_anchor: s.day };
}

/**
 * Reads the account's schedule back. Anything we do not offer (daily, manual,
 * a weekend anchor set from Stripe's side) comes back as null so the form can
 * say so instead of pretending it is one of its options.
 */
export function fromStripeSchedule(
  schedule: Stripe.Account.Settings.Payouts.Schedule | null | undefined,
): PayoutSchedule | null {
  if (!schedule) return null;
  if (schedule.interval === 'weekly' && WEEKDAYS.includes(schedule.weekly_anchor as Weekday)) {
    return { interval: 'weekly', weekday: schedule.weekly_anchor as Weekday };
  }
  if (schedule.interval === 'monthly' && typeof schedule.monthly_anchor === 'number') {
    const d = schedule.monthly_anchor;
    return { interval: 'monthly', day: d >= 29 ? LAST_DAY : d };
  }
  return null;
}
