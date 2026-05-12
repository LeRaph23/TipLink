import { describe, it, expect } from 'vitest';
import {
  WEEKLY_TIERS,
  MONTHLY_CHALLENGE,
  REFERRAL_REWARDS,
  REFERRAL_VALIDATION_MIN_SALES,
  getWeeklyTier,
} from '@/lib/ambassador-tiers';

describe('WEEKLY_TIERS (reduced bonuses)', () => {
  it('Bronze pays 15€ at 5 sales', () => {
    const t = WEEKLY_TIERS.find(x => x.id === 'bronze');
    expect(t).toBeDefined();
    expect(t!.threshold).toBe(5);
    expect(t!.bonus).toBe(1500);
  });

  it('Silver pays 30€ at 8 sales', () => {
    const t = WEEKLY_TIERS.find(x => x.id === 'silver');
    expect(t!.threshold).toBe(8);
    expect(t!.bonus).toBe(3000);
  });

  it('Gold pays 50€ at 10 sales', () => {
    const t = WEEKLY_TIERS.find(x => x.id === 'gold');
    expect(t!.threshold).toBe(10);
    expect(t!.bonus).toBe(5000);
  });

  it('returns highest matched tier only (non-cumulative)', () => {
    expect(getWeeklyTier(4)?.id).toBeUndefined();
    expect(getWeeklyTier(5)?.id).toBe('bronze');
    expect(getWeeklyTier(7)?.id).toBe('bronze');
    expect(getWeeklyTier(8)?.id).toBe('silver');
    expect(getWeeklyTier(9)?.id).toBe('silver');
    expect(getWeeklyTier(10)?.id).toBe('gold');
    expect(getWeeklyTier(100)?.id).toBe('gold');
  });

  it('returns null below bronze', () => {
    expect(getWeeklyTier(0)).toBeNull();
    expect(getWeeklyTier(4)).toBeNull();
  });
});

describe('MONTHLY_CHALLENGE (reduced)', () => {
  it('pays 100€ at threshold 15 to #1', () => {
    expect(MONTHLY_CHALLENGE.threshold).toBe(15);
    expect(MONTHLY_CHALLENGE.bonus).toBe(10000);
  });
});

describe('REFERRAL_REWARDS', () => {
  it('validation is 25€', () => {
    expect(REFERRAL_REWARDS.validation).toBe(2500);
  });
  it('milestone_5 is 100€', () => {
    expect(REFERRAL_REWARDS.milestone_5).toBe(10000);
  });
  it('milestone_10 is 250€', () => {
    expect(REFERRAL_REWARDS.milestone_10).toBe(25000);
  });
  it('requires 2 sales for validation', () => {
    expect(REFERRAL_VALIDATION_MIN_SALES).toBe(2);
  });
});
