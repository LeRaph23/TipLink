import 'server-only';
import type { createServiceClient } from '@/lib/supabase/service';
import { deriveReviewImpact } from './review-teaser';
import { currentMonth, monthPeriod } from '@/lib/export/payroll';

type Service = ReturnType<typeof createServiceClient>;

/**
 * What Pro did for a group over a window, in the numbers it is sold on.
 *
 * One function for every place that makes the case (the dashboard, the billing
 * card, the end-of-trial email) so they can never quote different figures for
 * the same month. Each number is something the manager could check: tips from
 * their own transactions, clicks and compliments from rows that can only exist
 * against a real tip.
 */
export type ProImpact = {
  since: string;
  tipCount: number;
  clickCount: number;
  complimentCount: number;
  hasReviewLink: boolean;
};

export async function getProImpact(
  service: Service,
  groupId: string,
  since: Date,
): Promise<ProImpact | null> {
  const { data: ests } = await service
    .from('establishments')
    .select('id, google_review_url')
    .eq('group_id', groupId)
    .is('deleted_at', null);
  if (!ests?.length) return null;

  const ids = ests.map((e) => e.id);
  const sinceIso = since.toISOString();
  const [tips, clicks, compliments] = await Promise.all([
    service.from('transactions').select('id', { count: 'exact', head: true })
      .in('establishment_id', ids).eq('status', 'succeeded').gte('created_at', sinceIso),
    service.from('review_clicks').select('id', { count: 'exact', head: true })
      .in('establishment_id', ids).gte('clicked_at', sinceIso),
    service.from('tip_compliments').select('id', { count: 'exact', head: true })
      .in('establishment_id', ids).gte('created_at', sinceIso),
  ]);

  const tipCount = tips.count ?? 0;
  const { clickCount } = deriveReviewImpact(tipCount, clicks.count ?? 0);
  return {
    since: sinceIso,
    tipCount,
    clickCount,
    complimentCount: Math.min(compliments.count ?? 0, tipCount),
    hasReviewLink: ests.some((e) => (e.google_review_url ?? '').trim().length > 0),
  };
}

/** The first of the current month, Paris time, as the default window. */
export function monthStartParis(now: Date = new Date()): Date {
  return new Date(monthPeriod(currentMonth(now)).start);
}
