/**
 * Whether the dashboard shows the Pro nudge this visit.
 *
 * Kept pure because the rule is mostly a list of people who must not see it,
 * and that list is the difference between a reminder and a nag. Every visit to
 * the home page is a chance to get this wrong in one direction or the other.
 */
export type ProNudgeFacts = {
  isPro: boolean;
  /** Inside a running trial: they already have the feature. */
  trialing: boolean;
  /** The establishment can actually take a payment. */
  payable: boolean;
  /** Tips this month. The nudge carries this number and nothing else. */
  tipCount: number;
  /** ISO timestamp of the last dismissal, from `groups.settings`. */
  dismissedAt: string | null;
};

/** How long a dismissal holds. One month, so it returns with new figures. */
export const NUDGE_SNOOZE_DAYS = 30;

export function shouldShowProNudge(facts: ProNudgeFacts, now: Date = new Date()): boolean {
  // Nothing to sell to someone who has it, including on trial.
  if (facts.isPro || facts.trialing) return false;

  // An establishment that cannot yet take a tip has a real problem, and it is
  // not this one. Whatever the dashboard says to them should be about getting
  // paid at all.
  if (!facts.payable) return false;

  // The nudge is the number. No tips this month means no number, and
  // "0 customers could have left a review" argues against buying.
  if (facts.tipCount < 1) return false;

  if (!facts.dismissedAt) return true;
  const dismissed = new Date(facts.dismissedAt);
  if (Number.isNaN(dismissed.getTime())) return true;

  const elapsedDays = (now.getTime() - dismissed.getTime()) / 86_400_000;
  // A dismissal in the future is a clock problem, not a decision to respect
  // forever: treat anything not yet elapsed as still held.
  return elapsedDays >= NUDGE_SNOOZE_DAYS;
}
