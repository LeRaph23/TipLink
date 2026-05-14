import { describe, it, expect } from 'vitest';
import {
  WEEKLY_TIERS,
  MONTHLY_CHALLENGE,
  REFERRAL_REWARDS,
  REFERRAL_VALIDATION_MIN_SALES,
  getWeeklyTier,
  computeClosedWeekBonuses,
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
  it('requires 3 sales for validation', () => {
    expect(REFERRAL_VALIDATION_MIN_SALES).toBe(3);
  });
});

describe('computeClosedWeekBonuses', () => {
  // Fixed reference point: Wednesday 2026-05-13 12:00 UTC = 14:00 Paris
  // Current week (Paris): Mon 2026-05-11 → Sun 2026-05-17
  const NOW = new Date('2026-05-13T12:00:00Z');

  // Dates in past weeks (Paris time)
  const LAST_WEEK     = '2026-05-07T10:00:00Z'; // Thu last week
  const TWO_WEEKS_AGO = '2026-04-30T10:00:00Z'; // Thu two weeks ago

  // Date in current week
  const THIS_WEEK = '2026-05-12T10:00:00Z'; // Tue this week

  const make = (date: string, n: number) =>
    Array.from({ length: n }, () => ({ created_at: date }));

  it('returns 0 for empty sales', () => {
    expect(computeClosedWeekBonuses([], NOW)).toBe(0);
  });

  it('returns 0 when all sales are in the current week', () => {
    expect(computeClosedWeekBonuses(make(THIS_WEEK, 10), NOW)).toBe(0);
  });

  it('returns 0 for a past week below bronze (4 sales)', () => {
    expect(computeClosedWeekBonuses(make(LAST_WEEK, 4), NOW)).toBe(0);
  });

  it('pays bronze (15€) for a past week with exactly 5 sales', () => {
    expect(computeClosedWeekBonuses(make(LAST_WEEK, 5), NOW)).toBe(1500);
  });

  it('pays silver (30€) for a past week with 8 sales, not bronze+silver', () => {
    expect(computeClosedWeekBonuses(make(LAST_WEEK, 8), NOW)).toBe(3000);
  });

  it('pays gold (50€) for a past week with 10 sales, not cumulative', () => {
    expect(computeClosedWeekBonuses(make(LAST_WEEK, 10), NOW)).toBe(5000);
  });

  it('sums bonuses across multiple closed weeks', () => {
    // Last week: 5 sales → bronze 15€ | Two weeks ago: 10 sales → gold 50€ | Total: 65€
    const sales = [...make(LAST_WEEK, 5), ...make(TWO_WEEKS_AGO, 10)];
    expect(computeClosedWeekBonuses(sales, NOW)).toBe(6500);
  });

  it('ignores current-week sales when counting past weeks', () => {
    // Last week bronze (15€) + this week ignored even though it would be gold
    const sales = [...make(LAST_WEEK, 5), ...make(THIS_WEEK, 10)];
    expect(computeClosedWeekBonuses(sales, NOW)).toBe(1500);
  });

  it('skips malformed dates without throwing', () => {
    const sales = [
      { created_at: 'not-a-date' },
      ...make(LAST_WEEK, 5),
    ];
    expect(computeClosedWeekBonuses(sales, NOW)).toBe(1500);
  });
});
