import { describe, it, expect } from 'vitest';
import { parseOfferEnd, launchOfferState, formatOfferEnd } from '@/lib/launch-offer';

describe('parseOfferEnd', () => {
  it('parses a YYYY-MM-DD date as the end of that day in UTC', () => {
    const d = parseOfferEnd('2026-08-31');
    expect(d?.toISOString()).toBe('2026-08-31T23:59:59.999Z');
  });

  it('tolerates surrounding whitespace', () => {
    expect(parseOfferEnd('  2026-08-31 ')?.getUTCDate()).toBe(31);
  });

  it.each([undefined, null, '', 'soon', '31/08/2026', '2026-8-31'])(
    'returns null for malformed input %p',
    (raw) => {
      expect(parseOfferEnd(raw as string | undefined)).toBeNull();
    }
  );

  it('rejects impossible dates instead of rolling them over', () => {
    // Date.UTC(2026, 1, 30) silently becomes 2 March — that would announce a
    // deadline nobody configured.
    expect(parseOfferEnd('2026-02-30')).toBeNull();
    expect(parseOfferEnd('2026-13-01')).toBeNull();
  });
});

describe('launchOfferState', () => {
  it('is inactive when no end date is configured', () => {
    expect(launchOfferState(undefined)).toEqual({ active: false });
  });

  it('is inactive when the end date is malformed', () => {
    expect(launchOfferState('not-a-date')).toEqual({ active: false });
  });

  it('is inactive once the deadline has passed', () => {
    const now = new Date('2026-09-01T00:00:00Z');
    expect(launchOfferState('2026-08-31', now)).toEqual({ active: false });
  });

  it('stays active through the final day', () => {
    const now = new Date('2026-08-31T18:00:00Z');
    const state = launchOfferState('2026-08-31', now);
    expect(state.active).toBe(true);
    if (state.active) expect(state.daysLeft).toBe(1);
  });

  it('counts whole days remaining, rounding up', () => {
    const now = new Date('2026-08-25T12:00:00Z');
    const state = launchOfferState('2026-08-31', now);
    expect(state.active).toBe(true);
    if (state.active) expect(state.daysLeft).toBe(7);
  });

  it('never reports zero days left while still active', () => {
    const now = new Date('2026-08-31T23:59:59.000Z');
    const state = launchOfferState('2026-08-31', now);
    expect(state.active).toBe(true);
    if (state.active) expect(state.daysLeft).toBe(1);
  });
});

describe('formatOfferEnd', () => {
  it('formats in French', () => {
    expect(formatOfferEnd(new Date('2026-08-31T23:59:59.999Z'), 'fr')).toBe('31 août 2026');
  });

  it('formats in English', () => {
    expect(formatOfferEnd(new Date('2026-08-31T23:59:59.999Z'), 'en')).toBe('31 August 2026');
  });

  it('uses UTC so the displayed day never shifts with the viewer timezone', () => {
    // 23:59:59.999Z is the previous day in any negative offset; formatting must
    // still show 31 August, the date that was configured.
    expect(formatOfferEnd(new Date('2026-08-31T23:59:59.999Z'), 'fr')).toContain('31');
  });
});
