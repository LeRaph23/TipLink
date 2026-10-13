import { describe, it, expect } from 'vitest';
import {
  LAST_DAY,
  fromStripeSchedule,
  parsePayoutSchedule,
  toStripeSchedule,
} from '@/lib/stripe/payout-schedule';

describe('payout schedule', () => {
  it('accepts the weekly and monthly choices the form offers', () => {
    expect(parsePayoutSchedule({ interval: 'weekly', weekday: 'friday' })).toEqual({ interval: 'weekly', weekday: 'friday' });
    expect(parsePayoutSchedule({ interval: 'monthly', day: 1 })).toEqual({ interval: 'monthly', day: 1 });
    expect(parsePayoutSchedule({ interval: 'monthly', day: LAST_DAY })).toEqual({ interval: 'monthly', day: 31 });
  });

  it('refuses what it does not offer', () => {
    // Daily would bill a Connect payout fee every day.
    expect(parsePayoutSchedule({ interval: 'daily' })).toBeNull();
    expect(parsePayoutSchedule({ interval: 'weekly', weekday: 'sunday' })).toBeNull();
    expect(parsePayoutSchedule({ interval: 'monthly', day: 30 })).toBeNull();
    expect(parsePayoutSchedule({ interval: 'monthly', day: 0 })).toBeNull();
    expect(parsePayoutSchedule({ interval: 'monthly', day: 2.5 })).toBeNull();
    expect(parsePayoutSchedule(null)).toBeNull();
  });

  it('round-trips through Stripe’s shape', () => {
    expect(toStripeSchedule({ interval: 'weekly', weekday: 'monday' })).toEqual({ interval: 'weekly', weekly_anchor: 'monday' });
    expect(toStripeSchedule({ interval: 'monthly', day: 31 })).toEqual({ interval: 'monthly', monthly_anchor: 31 });
    expect(fromStripeSchedule({ interval: 'weekly', weekly_anchor: 'monday', delay_days: 7 } as never)).toEqual({ interval: 'weekly', weekday: 'monday' });
    expect(fromStripeSchedule({ interval: 'monthly', monthly_anchor: 15, delay_days: 7 } as never)).toEqual({ interval: 'monthly', day: 15 });
  });

  it('reads a 29-31 anchor as "last day", and anything else as unknown', () => {
    expect(fromStripeSchedule({ interval: 'monthly', monthly_anchor: 30, delay_days: 7 } as never)).toEqual({ interval: 'monthly', day: LAST_DAY });
    expect(fromStripeSchedule({ interval: 'daily', delay_days: 7 } as never)).toBeNull();
    expect(fromStripeSchedule({ interval: 'manual', delay_days: 7 } as never)).toBeNull();
    expect(fromStripeSchedule(null)).toBeNull();
  });
});
