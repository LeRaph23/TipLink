import { describe, it, expect } from 'vitest';
import { getReviewTeaser } from '@/lib/billing/review-teaser';

type Est = { id: string; google_review_url: string | null };

/**
 * Minimal stand-in for the two query chains getReviewTeaser builds. Each
 * terminal call (`.is` for establishments, `.gte` for transactions) resolves,
 * which is exactly where the real client resolves too.
 */
function fakeService(opts: { ests: Est[] | null; count?: number | null }) {
  const ests = {
    select: () => ests,
    eq: () => ests,
    is: () => Promise.resolve({ data: opts.ests }),
  };
  const transactions = {
    select: () => transactions,
    in: () => transactions,
    eq: () => transactions,
    gte: () => Promise.resolve({ count: opts.count ?? null }),
  };
  return {
    from: (table: string) => (table === 'establishments' ? ests : transactions),
  } as unknown as Parameters<typeof getReviewTeaser>[0];
}

const GROUP = '11111111-1111-1111-1111-111111111111';

describe('getReviewTeaser', () => {
  it('counts this month\'s tips when a review link is configured', async () => {
    const service = fakeService({
      ests: [{ id: 'e1', google_review_url: 'https://search.google.com/local/writereview?placeid=x' }],
      count: 47,
    });

    expect(await getReviewTeaser(service, GROUP)).toEqual({ tipCount: 47 });
  });

  it('counts tips across every establishment in the group', async () => {
    const service = fakeService({
      ests: [
        { id: 'e1', google_review_url: null },
        { id: 'e2', google_review_url: 'https://search.google.com/local/writereview?placeid=y' },
      ],
      count: 3,
    });

    expect(await getReviewTeaser(service, GROUP)).toEqual({ tipCount: 3 });
  });

  // Upgrading alone would not produce a single review — the manager would have
  // to add the link too. Claiming they are one click away would be false.
  it('shows nothing when no establishment has a review link', async () => {
    const service = fakeService({
      ests: [{ id: 'e1', google_review_url: null }, { id: 'e2', google_review_url: '   ' }],
      count: 90,
    });

    expect(await getReviewTeaser(service, GROUP)).toBeNull();
  });

  // "0 customers could have left a review" argues against buying.
  it('shows nothing before the first tip of the month', async () => {
    const withLink: Est[] = [{ id: 'e1', google_review_url: 'https://example.test/review' }];

    expect(await getReviewTeaser(fakeService({ ests: withLink, count: 0 }), GROUP)).toBeNull();
    expect(await getReviewTeaser(fakeService({ ests: withLink, count: null }), GROUP)).toBeNull();
  });

  it('shows nothing for a group with no establishments', async () => {
    expect(await getReviewTeaser(fakeService({ ests: [] }), GROUP)).toBeNull();
    expect(await getReviewTeaser(fakeService({ ests: null }), GROUP)).toBeNull();
  });
});
