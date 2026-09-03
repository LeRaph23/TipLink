import { describe, it, expect } from 'vitest';
import { derivePayabilityState } from '@/lib/stripe/establishment-account';

const base = {
  accountId: 'acct_123',
  detailsSubmitted: false,
  chargesEnabled: false,
  payoutsEnabled: false,
};

// The banner says three different things and only one of them asks the manager
// to do something, so mixing two of these states up either nags someone who is
// waiting on Stripe or leaves a closed tag looking fine.
describe('derivePayabilityState', () => {
  it('has not started without a Stripe account', () => {
    expect(derivePayabilityState({ ...base, accountId: null })).toBe('not_started');
  });

  it('is incomplete once the account exists but the form was never sent', () => {
    expect(derivePayabilityState(base)).toBe('incomplete');
  });

  it('is verifying once the form is in and Stripe has not cleared it', () => {
    expect(derivePayabilityState({ ...base, detailsSubmitted: true })).toBe('verifying');
    // Charges live, payouts not: money comes in and sits on the platform. Still
    // Stripe's move, not the manager's.
    expect(
      derivePayabilityState({ ...base, detailsSubmitted: true, chargesEnabled: true })
    ).toBe('verifying');
  });

  it('is ready only when charges and payouts are both live', () => {
    expect(
      derivePayabilityState({
        accountId: 'acct_123',
        detailsSubmitted: true,
        chargesEnabled: true,
        payoutsEnabled: true,
      })
    ).toBe('ready');
  });

  // get_public_staff gates the tip page on charges AND payouts, so a half-live
  // account must never read as ready here either.
  it('does not call a half-live account ready', () => {
    expect(
      derivePayabilityState({ ...base, detailsSubmitted: true, payoutsEnabled: true })
    ).toBe('verifying');
  });
});
