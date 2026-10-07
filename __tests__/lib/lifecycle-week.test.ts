import { describe, it, expect } from 'vitest';
import { lastParisWeek, weekLabel } from '@/lib/email/lifecycle-helpers';

// The Monday recap says "la semaine du 28 septembre au 4 octobre", so the
// window must be exactly the previous Monday-to-Monday in Paris time, across
// both clock changes.

describe('lastParisWeek', () => {
  it('is the previous Monday 00:00 to this Monday 00:00, Paris summer time', () => {
    // Monday 5 October 2026, 09:00 UTC (the cron's hour).
    const { start, end } = lastParisWeek(new Date('2026-10-05T09:00:00Z'));
    expect(start.toISOString()).toBe('2026-09-27T22:00:00.000Z');
    expect(end.toISOString()).toBe('2026-10-04T22:00:00.000Z');
  });

  it('handles the week the clocks go back (25 October 2026)', () => {
    const { start, end } = lastParisWeek(new Date('2026-10-26T09:00:00Z'));
    expect(start.toISOString()).toBe('2026-10-18T22:00:00.000Z');
    expect(end.toISOString()).toBe('2026-10-25T23:00:00.000Z');
  });

  it('handles winter time', () => {
    const { start, end } = lastParisWeek(new Date('2027-01-11T09:00:00Z'));
    expect(start.toISOString()).toBe('2027-01-03T23:00:00.000Z');
    expect(end.toISOString()).toBe('2027-01-10T23:00:00.000Z');
  });

  it('labels the week by its Monday and Sunday', () => {
    const { start, end } = lastParisWeek(new Date('2026-10-05T09:00:00Z'));
    expect(weekLabel(start, end, 'fr')).toBe('du 28 septembre au 4 octobre');
    expect(weekLabel(start, end, 'en')).toBe('of 28 September to 4 October');
  });
});
