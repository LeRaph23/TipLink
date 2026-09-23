import { describe, it, expect } from 'vitest';
import { tipAmountOf, sumTipAmounts } from '@/lib/tips/amounts';
import { computeTipTotal } from '@/lib/pricing/tip-fees';

describe('tipAmountOf', () => {
  it('returns the tip, not the gross charge, for a post-00073 row', () => {
    // A 5 € tip is charged at 5 € + 25 c + 5 % = 5,50 €.
    const gross = computeTipTotal(500);
    expect(gross).toBe(550);
    expect(tipAmountOf({ amount: gross, metadata: { tip_amount: 500, service_fee: 50 } })).toBe(500);
  });

  it('falls back to amount for a legacy row, where amount was the tip', () => {
    expect(tipAmountOf({ amount: 500, metadata: { platform_fee: 25 } })).toBe(500);
    expect(tipAmountOf({ amount: 500, metadata: null })).toBe(500);
  });

  it('ignores a malformed tip_amount rather than trusting it', () => {
    expect(tipAmountOf({ amount: 550, metadata: { tip_amount: 'abc' } })).toBe(550);
    expect(tipAmountOf({ amount: 550, metadata: { tip_amount: -5 } })).toBe(550);
    expect(tipAmountOf({ amount: 550, metadata: { tip_amount: null } })).toBe(550);
  });

  it('treats a zero tip as a real zero, not a missing value', () => {
    expect(tipAmountOf({ amount: 25, metadata: { tip_amount: 0 } })).toBe(0);
  });

  it('is 0 when there is nothing usable', () => {
    expect(tipAmountOf({ amount: null, metadata: {} })).toBe(0);
    expect(tipAmountOf({ amount: 0, metadata: {} })).toBe(0);
  });

  // The concrete regression: 20 tips of 5 € is 100 € of tips and 110 € charged.
  it('sums to what the salon receives, not what the customers paid', () => {
    const rows = Array.from({ length: 20 }, () => ({
      amount: computeTipTotal(500),
      metadata: { tip_amount: 500, service_fee: 50 },
    }));
    expect(sumTipAmounts(rows)).toBe(10000);
    expect(rows.reduce((s, r) => s + r.amount, 0)).toBe(11000);
  });
});
