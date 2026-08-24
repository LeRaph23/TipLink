/**
 * Tip fee model.
 *
 * This arithmetic is the contract between the browser and the server: the
 * amount shown to the tipper and the amount the route handler is willing to
 * charge must agree to the centime, or the payment is rejected.
 */
import { describe, it, expect } from 'vitest';
import {
  TIP_FEE_BPS,
  TIP_FEE_FIXED_CENTS,
  computeTipFee,
  computeTipTotal,
  resolveTipFeeConfig,
} from '@/lib/pricing/tip-fees';

describe('computeTipFee / computeTipTotal', () => {
  it('adds the fixed part plus the variable part on top of the tip', () => {
    // 5,00 € tip → 0,25 € + 5 % of 5,00 € = 0,50 € → 5,50 € debited.
    expect(computeTipFee(500)).toBe(50);
    expect(computeTipTotal(500)).toBe(550);
  });

  it('never deducts anything from the tip itself', () => {
    for (const tip of [50, 100, 233, 500, 1000, 9999]) {
      expect(computeTipTotal(tip) - computeTipFee(tip)).toBe(tip);
    }
  });

  it('matches the documented defaults', () => {
    expect(TIP_FEE_FIXED_CENTS).toBe(25);
    expect(TIP_FEE_BPS).toBe(500);
    expect(computeTipFee(1000)).toBe(75);
    expect(computeTipTotal(2000)).toBe(2125);
  });

  it('rounds the variable part up, so the platform never loses a centime', () => {
    // 3,33 € × 5 % = 16,65 c → 17 c, not 16 c.
    expect(computeTipFee(333)).toBe(25 + 17);
    // 0,01 € × 5 % = 0,05 c → 1 c: a positive tip always carries some variable fee.
    expect(computeTipFee(1)).toBe(26);
    // Exact multiples are not inflated.
    expect(computeTipFee(200)).toBe(35);
  });

  it('honours a per-group config', () => {
    expect(computeTipFee(1000, { fixedCents: 0, bps: 200 })).toBe(20);
    expect(computeTipTotal(1000, { fixedCents: 0, bps: 200 })).toBe(1020);
    expect(computeTipFee(1000, { fixedCents: 30, bps: 0 })).toBe(30);
  });

  it('charges the fixed part only when the tip is zero or invalid', () => {
    expect(computeTipFee(0)).toBe(25);
    expect(computeTipFee(-100)).toBe(25);
    expect(computeTipFee(Number.NaN)).toBe(25);
  });

  it('is stable at the enforced tip bounds', () => {
    // 0,50 € minimum accepted by the intent routes.
    expect(computeTipTotal(50)).toBe(50 + 25 + 3);
    // 100 000 € maximum.
    expect(computeTipTotal(10_000_000)).toBe(10_000_000 + 25 + 500_000);
  });
});

describe('resolveTipFeeConfig', () => {
  it('falls back to the platform default when nothing is provided', () => {
    expect(resolveTipFeeConfig(null)).toEqual({ fixedCents: 25, bps: 500 });
    expect(resolveTipFeeConfig({})).toEqual({ fixedCents: 25, bps: 500 });
  });

  it('fills in only the missing half', () => {
    expect(resolveTipFeeConfig({ bps: 200 })).toEqual({ fixedCents: 25, bps: 200 });
    expect(resolveTipFeeConfig({ fixedCents: 0 })).toEqual({ fixedCents: 0, bps: 500 });
  });

  it('clamps out-of-range and non-numeric values instead of trusting them', () => {
    // Mirrors the CHECK constraints on `groups`: a malformed row must never
    // produce a nonsensical charge.
    expect(resolveTipFeeConfig({ bps: 99_999 }).bps).toBe(1500);
    expect(resolveTipFeeConfig({ bps: -10 }).bps).toBe(0);
    expect(resolveTipFeeConfig({ fixedCents: 100_000 }).fixedCents).toBe(500);
    expect(resolveTipFeeConfig({ fixedCents: Number.NaN }).fixedCents).toBe(25);
    expect(resolveTipFeeConfig({ bps: '500' as unknown as number }).bps).toBe(500);
  });
});
