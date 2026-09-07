import { describe, it, expect } from 'vitest';
import { deriveReviewImpact } from '@/lib/billing/review-teaser';

describe('deriveReviewImpact', () => {
  it('reports the ratio a subscriber can check against their own month', () => {
    expect(deriveReviewImpact(47, 12)).toEqual({ tipCount: 47, clickCount: 12, percent: 26 });
  });

  // A card that only appeared when the number flattered the feature would be
  // worth nothing the month it mattered.
  it('reports a month with no clicks rather than hiding it', () => {
    expect(deriveReviewImpact(47, 0)).toEqual({ tipCount: 47, clickCount: 0, percent: 0 });
  });

  // The two counts come from different tables over the same window, so a tip
  // taken in the last minutes of last month whose customer clicked today can
  // land on this month's clicks and last month's tips.
  it('never claims more clicks than there were tips', () => {
    expect(deriveReviewImpact(2, 3)).toEqual({ tipCount: 2, clickCount: 2, percent: 100 });
  });

  it('has no percentage to give when there were no tips', () => {
    expect(deriveReviewImpact(0, 0).percent).toBeNull();
  });
});
