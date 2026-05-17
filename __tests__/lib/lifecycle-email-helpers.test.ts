import { describe, it, expect } from 'vitest';
import { firstNameFrom, isoWeekBucket, dayWindowBucket } from '@/lib/email/lifecycle-helpers';

describe('firstNameFrom', () => {
  it('extracts the first whitespace-delimited token', () => {
    expect(firstNameFrom('Marie Dupont')).toBe('Marie');
    expect(firstNameFrom('  Jean-Pierre Martin ')).toBe('Jean-Pierre');
  });

  it('returns the whole trimmed string when the first token is too short', () => {
    expect(firstNameFrom('A Team')).toBe('A Team');
  });

  it('falls back when the name is empty or missing', () => {
    expect(firstNameFrom('', 'Bonjour')).toBe('Bonjour');
    expect(firstNameFrom(null, 'Bonjour')).toBe('Bonjour');
    expect(firstNameFrom(undefined)).toBe('');
  });
});

describe('isoWeekBucket', () => {
  it('formats as YYYY-Www', () => {
    expect(isoWeekBucket(new Date('2026-05-18T12:00:00Z'))).toMatch(/^2026-W\d{2}$/);
  });

  it('is stable across one ISO week and changes at the next', () => {
    const monday = isoWeekBucket(new Date('2026-05-18T00:00:00Z'));
    const sunday = isoWeekBucket(new Date('2026-05-24T23:00:00Z'));
    const nextMonday = isoWeekBucket(new Date('2026-05-25T00:00:00Z'));
    expect(monday).toBe(sunday);
    expect(monday).not.toBe(nextMonday);
  });
});

describe('dayWindowBucket', () => {
  it('is stable within the same day', () => {
    const morning = dayWindowBucket(new Date('2026-05-15T03:00:00Z'), 30);
    const evening = dayWindowBucket(new Date('2026-05-15T20:00:00Z'), 30);
    expect(morning).toBe(evening);
  });

  it('changes once the window has elapsed', () => {
    const now = dayWindowBucket(new Date('2026-05-15T03:00:00Z'), 30);
    const muchLater = dayWindowBucket(new Date('2026-08-15T03:00:00Z'), 30);
    expect(now).not.toBe(muchLater);
  });
});
