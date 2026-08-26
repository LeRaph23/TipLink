import 'server-only';
import type { createServiceClient } from '@/lib/supabase/service';

type Service = ReturnType<typeof createServiceClient>;

export type ReviewTeaser = {
  /** Tips the group actually collected this month. */
  tipCount: number;
};

/**
 * How many Google reviews a free group gave up this month.
 *
 * The argument for Pro is not a list of features, it is this number: every tip
 * already collected was a customer who would have been asked for a review, at
 * the one moment they were demonstrably happy. A count of real tips beats a
 * greyed-out button, which is what migration 00076 planned for and what the
 * dashboard never actually grew.
 *
 * Returns null — show nothing — in the two cases where the pitch would be
 * dishonest or useless:
 *
 *   - no review link on any establishment. Upgrading alone would not produce a
 *     single review; the manager would need to add the link too, so claiming
 *     they are one click from reviews is false.
 *   - no tips yet this month. "0 customers could have left a review" argues
 *     against buying, and a brand-new group has not seen the product work yet.
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
  if (!ests.some((e) => (e.google_review_url ?? '').trim().length > 0)) return null;

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

  return { tipCount: count };
}
