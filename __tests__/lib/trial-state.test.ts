import { describe, it, expect } from 'vitest';
import { deriveTrialState, isTrialWarningDue, trialSpent } from '@/lib/billing/trial';

const now = new Date('2026-03-10T12:00:00Z');
const inDays = (n: number) => new Date(now.getTime() + n * 86_400_000).toISOString();

describe('deriveTrialState', () => {
  it('says nothing about a group that never started a trial', () => {
    expect(deriveTrialState({ plan: 'free', subscriptionStatus: null, trialEndsAt: null }, now))
      .toEqual({ state: 'none' });
  });

  it('counts the days left while the trial runs', () => {
    const s = deriveTrialState(
      { plan: 'pro', subscriptionStatus: 'trialing', trialEndsAt: inDays(3) },
      now,
    );
    expect(s.state).toBe('trialing');
    expect(s.state === 'trialing' && s.daysLeft).toBe(3);
  });

  // Zero days left on a feature that still works is both wrong and alarming.
  it('rounds a part-day up rather than down to zero', () => {
    const s = deriveTrialState(
      { plan: 'pro', subscriptionStatus: 'trialing', trialEndsAt: inDays(0.2) },
      now,
    );
    expect(s.state === 'trialing' && s.daysLeft).toBe(1);
  });

  // The date alone would show "3 days left" to somebody already being charged.
  it('stops calling it a trial once the status has moved on', () => {
    expect(deriveTrialState(
      { plan: 'pro', subscriptionStatus: 'active', trialEndsAt: inDays(3) },
      now,
    )).toEqual({ state: 'none' });
  });

  // A trial that converted is the happy ending and needs no notice at all.
  it('says nothing when the trial ended and the subscription continued', () => {
    expect(deriveTrialState(
      { plan: 'pro', subscriptionStatus: 'active', trialEndsAt: inDays(-2) },
      now,
    )).toEqual({ state: 'none' });
  });

  it('reports a trial that ran out without converting', () => {
    const s = deriveTrialState(
      { plan: 'free', subscriptionStatus: 'canceled', trialEndsAt: inDays(-2) },
      now,
    );
    expect(s.state).toBe('ended');
  });

  it('ignores a date it cannot read', () => {
    expect(deriveTrialState({ plan: 'pro', subscriptionStatus: 'trialing', trialEndsAt: 'soon' }, now))
      .toEqual({ state: 'none' });
  });
});

describe('isTrialWarningDue', () => {
  const trialing = (days: number) =>
    deriveTrialState({ plan: 'pro', subscriptionStatus: 'trialing', trialEndsAt: inDays(days) }, now);

  it('is due inside the last three days', () => {
    expect(isTrialWarningDue(trialing(3))).toBe(true);
    expect(isTrialWarningDue(trialing(1))).toBe(true);
  });

  // A window, not an equality test: a cron run that is late or retried must not
  // skip the only warning a customer gets.
  it('is not due while there is still a week to go', () => {
    expect(isTrialWarningDue(trialing(7))).toBe(false);
  });

  it('is not due for a group with no trial', () => {
    expect(isTrialWarningDue({ state: 'none' })).toBe(false);
  });
});

describe('the cardless trial', () => {
  it('counts down a trial with no card on file, and says so', () => {
    const s = deriveTrialState(
      { plan: 'free', subscriptionStatus: null, trialEndsAt: null, freeTrialEndsAt: inDays(12) },
      now,
    );
    expect(s).toMatchObject({ state: 'trialing', daysLeft: 12, cardless: true });
  });

  it('reports it ended when nobody subscribed', () => {
    const s = deriveTrialState(
      { plan: 'free', subscriptionStatus: null, trialEndsAt: null, freeTrialEndsAt: inDays(-1) },
      now,
    );
    expect(s.state).toBe('ended');
  });

  // Adding a card during the cardless trial moves the end date onto Stripe's
  // trial, which converts by itself: from then on that is the trial to report.
  it('hands over to the Stripe trial once a card is on file', () => {
    const s = deriveTrialState(
      { plan: 'pro', subscriptionStatus: 'trialing', trialEndsAt: inDays(5), freeTrialEndsAt: inDays(5) },
      now,
    );
    expect(s).toMatchObject({ state: 'trialing', cardless: false });
  });

  it('says nothing to a paying subscriber whose cardless trial is long over', () => {
    expect(deriveTrialState(
      { plan: 'pro', subscriptionStatus: 'active', trialEndsAt: null, freeTrialEndsAt: inDays(-40) },
      now,
    )).toEqual({ state: 'none' });
  });
});

describe('trialSpent', () => {
  it('counts a trial of either kind', () => {
    expect(trialSpent({ trial_ends_at: null, pro_trial_started_at: null })).toBe(false);
    expect(trialSpent({ trial_ends_at: inDays(-3), pro_trial_started_at: null })).toBe(true);
    expect(trialSpent({ trial_ends_at: null, pro_trial_started_at: inDays(-3) })).toBe(true);
  });
});
