import { describe, it, expect } from 'vitest';
import { shouldShowProNudge } from '@/lib/dashboard/pro-nudge';

const now = new Date('2026-03-10T12:00:00Z');
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString();
const base = { isPro: false, trialing: false, payable: true, tipCount: 12, dismissedAt: null };

describe('shouldShowProNudge', () => {
  it('shows to a free group that is taking tips', () => {
    expect(shouldShowProNudge(base, now)).toBe(true);
  });

  it('never shows to somebody who already has the feature', () => {
    expect(shouldShowProNudge({ ...base, isPro: true }, now)).toBe(false);
    expect(shouldShowProNudge({ ...base, trialing: true }, now)).toBe(false);
  });

  // Whatever the dashboard says to an establishment that cannot take a payment
  // should be about getting paid at all.
  it('never shows to an establishment that cannot take a tip yet', () => {
    expect(shouldShowProNudge({ ...base, payable: false }, now)).toBe(false);
  });

  // The nudge is the number. Without tips there is no number, and zero argues
  // against buying.
  it('never shows without a month to point at', () => {
    expect(shouldShowProNudge({ ...base, tipCount: 0 }, now)).toBe(false);
  });

  it('stays away for a month after being dismissed', () => {
    expect(shouldShowProNudge({ ...base, dismissedAt: daysAgo(3) }, now)).toBe(false);
    expect(shouldShowProNudge({ ...base, dismissedAt: daysAgo(29) }, now)).toBe(false);
    expect(shouldShowProNudge({ ...base, dismissedAt: daysAgo(31) }, now)).toBe(true);
  });

  it('is not silenced forever by an unreadable or future timestamp', () => {
    expect(shouldShowProNudge({ ...base, dismissedAt: 'never' }, now)).toBe(true);
    expect(shouldShowProNudge({ ...base, dismissedAt: daysAgo(-400) }, now)).toBe(false);
  });
});
