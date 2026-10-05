import 'server-only';
import type { createServiceClient } from '@/lib/supabase/service';

type Service = ReturnType<typeof createServiceClient>;

export type ReviewTeaser = {
  /** Tips the group actually collected this month. */
  tipCount: number;
  /**
   * Whether any establishment has a Google review link. Without one the pitch
   * changes rather than disappears: compliments work without Google, and the
   * missing link is the first thing to fix whatever the plan.
   */
  hasReviewLink: boolean;
};

/**
 * How many happy customers a free group let go this month.
 *
 * The argument for Pro is not a list of features, it is this number: every tip
 * already collected was a customer who could have been invited to review the
 * place and to leave a word for whoever served them. A count of real tips
 * beats a greyed-out button.
 *
 * Returns null, show nothing, when there were no tips yet this month: "0
 * customers" argues against buying, and a brand-new group has not seen the
 * product work yet. It used to return null without a review link too, which
 * meant the groups furthest from getting reviews were the ones never told how.
 */
export async function getReviewTeaser(
  service: Service,
  groupId: string,
  now: Date = new Date(),
): Promise<ReviewTeaser | null> {
  const { data: ests } = await service
    .from('establishments')
    .select('id, google_review_url')
    .eq('group_id', groupId)
    .is('deleted_at', null);

  if (!ests?.length) return null;
  const hasReviewLink = ests.some((e) => (e.google_review_url ?? '').trim().length > 0);

  const monthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  ).toISOString();

  // `head: true` — the banner needs the count, never the rows, and a busy
  // establishment's month is thousands of them.
  const { count } = await service
    .from('transactions')
    .select('id', { count: 'exact', head: true })
    .in('establishment_id', ests.map((e) => e.id))
    .eq('status', 'succeeded')
    .gte('created_at', monthStart);

  if (!count || count < 1) return null;

  return { tipCount: count, hasReviewLink };
}

export type ReviewImpact = {
  /** Tips collected this month. */
  tipCount: number;
  /** Of those, how many sent their customer to the review page. */
  clickCount: number;
  /** Rounded percentage, or null when there is nothing to divide by. */
  percent: number | null;
  /**
   * Whether any establishment has a Google review link. Without one the
   * thank-you page shows no invitation at all, and the card used to claim it
   * did (sixth QA run).
   */
  hasReviewLink?: boolean;
};

/**
 * The arithmetic, separated from the queries so it can be checked.
 *
 * The pitch for Pro was three feature bullets, because nothing measured
 * whether the review invitation produced anything and there was therefore no
 * true sentence to write. `review_clicks` (migration 00077) is what makes one
 * possible, and a subscriber is owed the real ratio rather than a flattering
 * reading of it: a month with no clicks says so.
 */
export function deriveReviewImpact(tipCount: number, clickCount: number): ReviewImpact {
  // A click can only exist against a real tip of the same establishment, but
  // the two counts are read from different tables over the same window, and a
  // tip taken on the last day of last month whose customer clicked today would
  // otherwise show as 3 clicks out of 2 tips.
  const clicks = Math.min(clickCount, tipCount);
  return {
    tipCount,
    clickCount: clicks,
    percent: tipCount > 0 ? Math.round((clicks / tipCount) * 100) : null,
  };
}

/**
 * What the review invitation did for this group this month.
 *
 * The mirror image of `getReviewTeaser`: that one counts what a free group
 * gave up, this one counts what a paying group got. Returns null when there
 * were no tips at all, where both a ratio and a pitch would be meaningless.
 */
export async function getReviewImpact(
  service: Service,
  groupId: string,
  now: Date = new Date(),
): Promise<ReviewImpact | null> {
  const { data: ests } = await service
    .from('establishments')
    .select('id, google_review_url')
    .eq('group_id', groupId)
    .is('deleted_at', null);

  if (!ests?.length) return null;
  const estIds = ests.map((e) => e.id);
  const hasReviewLink = ests.some((e) => !!(e as { google_review_url?: string | null }).google_review_url);

  const monthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  ).toISOString();

  const [{ count: tipCount }, { count: clickCount }] = await Promise.all([
    service
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .in('establishment_id', estIds)
      .eq('status', 'succeeded')
      .gte('created_at', monthStart),
    service
      .from('review_clicks')
      .select('id', { count: 'exact', head: true })
      .in('establishment_id', estIds)
      .gte('clicked_at', monthStart),
  ]);

  if (!tipCount || tipCount < 1) return null;
  return { ...deriveReviewImpact(tipCount, clickCount ?? 0), hasReviewLink };
}
