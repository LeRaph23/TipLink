import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => ({}) }));

import { effectivePlan } from '@/lib/billing/entitlements';
import { summarizeCompliments } from '@/lib/compliments';
import { deriveListingProgress } from '@/lib/google-listing';

const now = new Date('2026-10-05T12:00:00Z');

describe('effectivePlan', () => {
  it('grants Pro to a subscriber', () => {
    expect(effectivePlan({ plan: 'pro', pro_trial_ends_at: null }, now)).toBe('pro');
  });
  it('grants Pro during the cardless trial, and stops on the date', () => {
    expect(effectivePlan({ plan: 'free', pro_trial_ends_at: '2026-10-20T00:00:00Z' }, now)).toBe('pro');
    expect(effectivePlan({ plan: 'free', pro_trial_ends_at: '2026-10-01T00:00:00Z' }, now)).toBe('free');
  });
  it('is free with no row or an unreadable date', () => {
    expect(effectivePlan(null, now)).toBe('free');
    expect(effectivePlan({ plan: 'free', pro_trial_ends_at: 'soon' }, now)).toBe('free');
  });
});

describe('summarizeCompliments', () => {
  it('ranks people by compliments and puts the team last', () => {
    const s = summarizeCompliments([
      { staff_id: null, tags: ['welcome'], message: null },
      { staff_id: null, tags: ['welcome'], message: null },
      { staff_id: null, tags: ['welcome'], message: null },
      { staff_id: 'a', tags: ['advice'], message: 'Merci' },
      { staff_id: 'b', tags: ['speed', 'smile'], message: null },
      { staff_id: 'b', tags: ['smile'], message: '  ' },
    ]);
    expect(s.map((x) => x.staffId)).toEqual(['b', 'a', null]);
    expect(s[0].topTags[0]).toEqual({ tag: 'smile', count: 2 });
    // A blank message is not a message.
    expect(s[0].messageCount).toBe(0);
    expect(s[1].messageCount).toBe(1);
  });

  it('ignores tags it does not know', () => {
    const [s] = summarizeCompliments([{ staff_id: 'a', tags: ['rude', 'care'], message: null }]);
    expect(s.topTags).toEqual([{ tag: 'care', count: 1 }]);
  });
});

describe('deriveListingProgress', () => {
  const row = (est: string, count: number, day: string, rating: number | null = 4.6) => ({
    establishment_id: est, review_count: count, rating, captured_at: `2026-${day}T07:00:00Z`,
  });

  it('is nothing until a listing has been read twice', () => {
    expect(deriveListingProgress([row('e1', 120, '09-01')])).toBeNull();
    expect(deriveListingProgress([])).toBeNull();
  });

  it('credits the difference between the first and latest reading', () => {
    const p = deriveListingProgress([row('e1', 132, '09-01'), row('e1', 140, '09-08'), row('e1', 148, '09-15', 4.7)]);
    expect(p).toMatchObject({ baselineCount: 132, currentCount: 148, gained: 16, since: '2026-09-01T07:00:00Z', rating: 4.7 });
  });

  it('sums establishments and never reports a loss as negative', () => {
    const p = deriveListingProgress([
      row('e1', 100, '09-01'), row('e1', 104, '09-08'),
      row('e2', 50, '09-03'), row('e2', 45, '09-10'),
    ]);
    expect(p?.gained).toBe(0);
    expect(p?.since).toBe('2026-09-01T07:00:00Z');
  });
});
