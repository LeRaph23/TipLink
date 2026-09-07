import { describe, it, expect } from 'vitest';
import { deriveMonthsFree } from '@/lib/billing/pro-pricing';

const eur = (unitAmount: number) => ({ unitAmount, currency: 'eur' });

describe('deriveMonthsFree', () => {
  // The dashboard says "2 mois offerts" next to the yearly price. It has to be
  // true of the two amounts actually configured in Stripe, not of the two that
  // were configured the day the sentence was written.
  it('reads the saving off the two prices', () => {
    expect(deriveMonthsFree(eur(1900), eur(19000))).toBe(2);
    expect(deriveMonthsFree(eur(1900), eur(20900))).toBe(1);
  });

  // Rounding 1.6 up to 2 would print a claim a customer can check and disprove
  // with a calculator, so an amount that is not a whole number of months gets
  // no claim at all.
  it('says nothing when the saving is not a round number of months', () => {
    expect(deriveMonthsFree(eur(1900), eur(19800))).toBeNull();
  });

  it('says nothing when the yearly price saves nothing', () => {
    expect(deriveMonthsFree(eur(1900), eur(22800))).toBeNull();
    expect(deriveMonthsFree(eur(1900), eur(21000))).toBeNull();
  });

  it('refuses to compare two currencies or a missing price', () => {
    expect(deriveMonthsFree(eur(1900), { unitAmount: 19000, currency: 'usd' })).toBeNull();
    expect(deriveMonthsFree(null, eur(19000))).toBeNull();
    expect(deriveMonthsFree(eur(1900), null)).toBeNull();
    expect(deriveMonthsFree(eur(0), eur(19000))).toBeNull();
  });
});
