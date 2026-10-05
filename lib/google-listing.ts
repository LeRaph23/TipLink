import 'server-only';
import type { createServiceClient } from '@/lib/supabase/service';
import { resolveGooglePlaceId } from '@/lib/google-places';

type Service = ReturnType<typeof createServiceClient>;

/**
 * The rating and review count of one Google listing, from Place Details.
 * Null on any failure: a missed reading is a gap in a chart, never an error
 * worth surfacing to a manager.
 */
export async function fetchListingStats(
  placeId: string,
): Promise<{ rating: number | null; reviewCount: number } | null> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey || !placeId) return null;
  try {
    const res = await fetch(
      `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,
      {
        headers: { 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': 'rating,userRatingCount' },
        signal: AbortSignal.timeout(5000),
        cache: 'no-store',
      },
    );
    if (!res.ok) {
      console.error('[google-listing] details failed', res.status, placeId);
      return null;
    }
    const data = (await res.json()) as { rating?: number; userRatingCount?: number };
    if (typeof data.userRatingCount !== 'number') return null;
    return { rating: typeof data.rating === 'number' ? data.rating : null, reviewCount: data.userRatingCount };
  } catch (err) {
    console.error('[google-listing] details threw', placeId, err);
    return null;
  }
}

export type ListingProgress = {
  /** When the first reading was taken: what "since" refers to. */
  since: string;
  baselineCount: number;
  currentCount: number;
  /** Never negative: Google removing reviews is not something we did. */
  gained: number;
  rating: number | null;
};

/**
 * First reading against latest, per establishment, summed across a group.
 *
 * Pure so the arithmetic that a subscription is judged on can be tested. One
 * reading is not progress (it is the baseline), so it returns null until two
 * exist for at least one establishment.
 */
export function deriveListingProgress(
  rows: Array<{ establishment_id: string; review_count: number; rating: number | string | null; captured_at: string }>,
): ListingProgress | null {
  const by = new Map<string, typeof rows>();
  for (const r of rows) {
    const list = by.get(r.establishment_id) ?? [];
    list.push(r);
    by.set(r.establishment_id, list);
  }
  let baseline = 0;
  let current = 0;
  let since: string | null = null;
  let rating: number | null = null;
  let measured = false;
  for (const list of by.values()) {
    list.sort((a, b) => a.captured_at.localeCompare(b.captured_at));
    const first = list[0];
    const last = list[list.length - 1];
    baseline += first.review_count;
    current += last.review_count;
    if (!since || first.captured_at < since) since = first.captured_at;
    if (rating === null && last.rating !== null) rating = Number(last.rating);
    if (list.length > 1) measured = true;
  }
  if (!measured || !since) return null;
  return {
    since,
    baselineCount: baseline,
    currentCount: current,
    gained: Math.max(0, current - baseline),
    rating,
  };
}

/** Reads a group's snapshots and derives its progress. */
export async function getListingProgress(
  service: Service,
  groupId: string,
): Promise<ListingProgress | null> {
  const { data: ests } = await service
    .from('establishments')
    .select('id')
    .eq('group_id', groupId)
    .is('deleted_at', null);
  if (!ests?.length) return null;
  const { data: rows } = await service
    .from('google_listing_snapshots')
    .select('establishment_id, review_count, rating, captured_at')
    .in('establishment_id', ests.map((e) => e.id))
    .order('captured_at', { ascending: true })
    .limit(2000);
  return deriveListingProgress(rows ?? []);
}

/** How often a listing is read. Weekly is plenty for a count that moves slowly. */
export const SNAPSHOT_EVERY_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Takes a reading for every establishment of a Pro group whose last one is a
 * week old, or that has none: the latter is the baseline, taken within a day
 * of Pro starting because the cron runs daily.
 */
export async function captureDueSnapshots(
  service: Service,
  now: Date = new Date(),
  budget = 200,
): Promise<{ captured: number; failed: number; considered: number }> {
  const tally = { captured: 0, failed: 0, considered: 0 };
  const nowIso = now.toISOString();

  const { data: groups } = await service
    .from('groups')
    .select('id')
    .is('deleted_at', null)
    .or(`plan.eq.pro,pro_trial_ends_at.gt.${nowIso}`)
    .limit(5000);
  if (!groups?.length) return tally;

  const { data: ests } = await service
    .from('establishments')
    .select('id, google_place_id, google_review_url')
    .in('group_id', groups.map((g) => g.id))
    .is('deleted_at', null)
    .eq('is_demo', false);

  for (const est of ests ?? []) {
    if (tally.captured + tally.failed >= budget) break;
    const placeId = resolveGooglePlaceId(est.google_place_id, est.google_review_url);
    if (!placeId) continue;

    const { data: last } = await service
      .from('google_listing_snapshots')
      .select('captured_at')
      .eq('establishment_id', est.id)
      .order('captured_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (last && now.getTime() - new Date(last.captured_at).getTime() < SNAPSHOT_EVERY_MS - 3_600_000) continue;

    tally.considered++;
    const stats = await fetchListingStats(placeId);
    if (!stats) { tally.failed++; continue; }
    const { error } = await service.from('google_listing_snapshots').insert({
      establishment_id: est.id,
      place_id: placeId,
      rating: stats.rating,
      review_count: stats.reviewCount,
      captured_at: nowIso,
    } as never);
    if (error) { tally.failed++; console.error('[google-listing] insert', error.message); }
    else tally.captured++;
  }
  return tally;
}
