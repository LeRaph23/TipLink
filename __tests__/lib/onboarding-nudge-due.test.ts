import { describe, it, expect } from 'vitest';
import { onboardingNudgeDue } from '@/lib/email/lifecycle-helpers';

const DAY = 86_400_000;
const now = Date.parse('2026-10-12T09:00:00Z');
const ago = (days: number) => new Date(now - days * DAY).toISOString();

describe('onboardingNudgeDue', () => {
  it('counts from sign-up for a group that has bought nothing', () => {
    expect(onboardingNudgeDue(ago(1), [], now)).toBeNull();
    expect(onboardingNudgeDue(ago(3), [], now)).toEqual({ step: 1, hasPlaque: false });
    expect(onboardingNudgeDue(ago(7), [], now)).toEqual({ step: 2, hasPlaque: false });
    expect(onboardingNudgeDue(ago(31), [], now)).toBeNull();
  });

  it('waits for the plaque to ship before nudging a buyer', () => {
    // The production case: paid on day 0, nudged on days 3 and 7, shipped on day 12.
    expect(onboardingNudgeDue(ago(7), [{ status: 'encoding', shipped_at: null }], now)).toBeNull();
    expect(onboardingNudgeDue(ago(7), [{ status: 'pending_fulfillment', shipped_at: null }], now)).toBeNull();
  });

  it('counts a buyer from the day the plaque shipped', () => {
    const order = (shippedDaysAgo: number) => [{ status: 'shipped', shipped_at: ago(shippedDaysAgo) }];
    expect(onboardingNudgeDue(ago(40), order(1), now)).toBeNull();
    expect(onboardingNudgeDue(ago(40), order(3), now)).toEqual({ step: 1, hasPlaque: true });
    expect(onboardingNudgeDue(ago(40), order(8), now)).toEqual({ step: 2, hasPlaque: true });
    expect(onboardingNudgeDue(ago(60), order(35), now)).toBeNull();
  });

  it('uses the first shipment when there are several', () => {
    const orders = [
      { status: 'delivered', shipped_at: ago(8) },
      { status: 'encoding', shipped_at: null },
    ];
    expect(onboardingNudgeDue(ago(20), orders, now)).toEqual({ step: 2, hasPlaque: true });
  });

  it('ignores unpaid and canceled orders', () => {
    expect(onboardingNudgeDue(ago(3), [{ status: 'pending_payment', shipped_at: null }], now))
      .toEqual({ step: 1, hasPlaque: false });
    expect(onboardingNudgeDue(ago(3), [{ status: 'canceled', shipped_at: null }], now))
      .toEqual({ step: 1, hasPlaque: false });
  });
});
