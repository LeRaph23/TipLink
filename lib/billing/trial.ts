/**
 * Where a group stands in its Digitip Pro trial.
 *
 * Every piece of plumbing for a trial already existed and nothing started
 * one. `trialing` counted as Pro (entitlements), the webhook wrote
 * `trial_ends_at` (migration 00076 added the column), and the checkout session
 * passed no `trial_period_days`, so the column was always null and nothing
 * ever read it.
 *
 * Kept pure and separate from the queries because it decides what a manager is
 * told about money: a trial whose end nobody sees coming produces a surprise
 * charge, which is the single most expensive thing a subscription product can
 * do to a customer's trust.
 */
export type TrialState =
  /** No trial: never had one, or it has been over long enough not to mention. */
  | { state: 'none' }
  /**
   * In a trial, with the whole thing still ahead or a few days left.
   * `cardless` is the Digitip trial started by the first tip (00088): nothing
   * is on file, so nothing will be charged, and the manager is told exactly
   * that. Otherwise it is a Stripe trial, which converts on its own.
   */
  | { state: 'trialing'; daysLeft: number; endsAt: Date; cardless: boolean }
  /** The trial ran out and the subscription did not continue. */
  | { state: 'ended'; endedAt: Date };

export type TrialFacts = {
  plan: string | null;
  subscriptionStatus: string | null;
  /** The Stripe subscription's trial end. */
  trialEndsAt: string | null;
  /** The cardless trial's end (`groups.pro_trial_ends_at`). */
  freeTrialEndsAt?: string | null;
};

/** How long a trial runs, cardless or Stripe's. */
export const TRIAL_DAYS = 30;

/**
 * Whether a group has already had its one trial, of either kind.
 *
 * Both columns, because they are written by different things: Stripe's by the
 * subscription webhook, the cardless one by the first tip. A manager who used
 * the cardless month and then subscribes must not be handed thirty more days.
 */
export function trialSpent(row: {
  trial_ends_at?: string | null;
  pro_trial_started_at?: string | null;
}): boolean {
  return Boolean(row.trial_ends_at || row.pro_trial_started_at);
}

/**
 * Stripe refuses a checkout `trial_end` less than 48 hours out. Below that,
 * a subscriber taking over a cardless trial is simply charged at once, which
 * costs them at most two days of a month they had for free.
 */
export const MIN_CARRYOVER_MS = 49 * 60 * 60 * 1000;

/** Days out from the end at which the warning email goes. */
export const TRIAL_WARNING_DAYS = 3;

const DAY_MS = 86_400_000;

/**
 * `daysLeft` is rounded up, so the last partial day still reads as "1 day
 * left" rather than "0". Telling somebody they have zero days left while the
 * feature still works is both wrong and alarming.
 */
export function deriveTrialState(facts: TrialFacts, now: Date = new Date()): TrialState {
  const stripeTrial = deriveStripeTrial(facts, now);
  if (stripeTrial.state !== 'none') return stripeTrial;
  // A paying subscriber is past any trial, whatever the cardless one says.
  if (facts.plan === 'pro') return { state: 'none' };

  if (!facts.freeTrialEndsAt) return { state: 'none' };
  const endsAt = new Date(facts.freeTrialEndsAt);
  if (Number.isNaN(endsAt.getTime())) return { state: 'none' };
  const remaining = endsAt.getTime() - now.getTime();
  if (remaining > 0) {
    return { state: 'trialing', daysLeft: Math.ceil(remaining / DAY_MS), endsAt, cardless: true };
  }
  return { state: 'ended', endedAt: endsAt };
}

function deriveStripeTrial(facts: TrialFacts, now: Date): TrialState {
  if (!facts.trialEndsAt) return { state: 'none' };

  const endsAt = new Date(facts.trialEndsAt);
  if (Number.isNaN(endsAt.getTime())) return { state: 'none' };

  const remaining = endsAt.getTime() - now.getTime();
  if (remaining > 0) {
    // Stripe reports `trialing` for the whole period. A group whose status has
    // already moved on (paid, or cancelled) is not in a trial whatever the
    // date says, and saying otherwise would show "3 days left" to somebody who
    // is being charged.
    if (facts.subscriptionStatus && facts.subscriptionStatus !== 'trialing') {
      return { state: 'none' };
    }
    return { state: 'trialing', daysLeft: Math.ceil(remaining / DAY_MS), endsAt, cardless: false };
  }

  // Past the end. Still Pro means the subscription converted, which is the
  // ordinary happy ending and needs no notice of any kind.
  if (facts.plan === 'pro') return { state: 'none' };
  return { state: 'ended', endedAt: endsAt };
}

/**
 * True on exactly the days the ending-soon email should go out.
 *
 * A window rather than an equality test: the cron runs once a day and a run
 * that is late, retried, or lands either side of a daylight-saving shift must
 * not silently skip the only warning a customer gets. The lifecycle log's
 * one-shot dedup is what stops the window sending twice.
 */
export function isTrialWarningDue(state: TrialState): boolean {
  return state.state === 'trialing' && state.daysLeft <= TRIAL_WARNING_DAYS;
}
