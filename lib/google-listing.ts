import 'server-only';
import type { createServiceClient } from '@/lib/supabase/service';
import { resolveGooglePlaceId } from '@/lib/google-places';

type Service = ReturnType<typeof createServiceClient>;

/**
 * The establishment's Google rating and review count, read live.
 *
 * Read at display time and never stored. Google's Places API policies allow
 * storing the place ID only: "You must not pre-fetch, cache, or store Places
 * API content" beyond that exemption. A first version of this feature kept a
 * weekly history of the review count to show "+9 reviews since…"; that history
 * was exactly the storage the policy forbids, so it went. What is shown is
 * the listing as Google reports it now, credited to Google Maps.
 */
export type ListingStats = { rating: number | null; reviewCount: number };

/** One listing's figures from Place Details. Null on any failure. */
export async function fetchListingStats(placeId: string): Promise<ListingStats | null> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey || !placeId) return null;
  try {
    const res = await fetch(
      `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,
      {
        headers: { 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': 'rating,userRatingCount' },
        signal: AbortSignal.timeout(4000),
        // No data cache: storing this content is what the policy rules out.
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

/**
 * The group's listing, for the dashboard: its first establishment that has a
 * resolvable place ID. Groups with several venues see the first one, which is
 * labelled with its name by the caller when that matters.
 */
export async function getGroupListing(
  service: Service,
  groupId: string,
): Promise<(ListingStats & { establishmentName: string }) | null> {
  const { data: ests } = await service
    .from('establishments')
    .select('name, google_place_id, google_review_url, is_demo')
    .eq('group_id', groupId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true });
  for (const e of ests ?? []) {
    if (e.is_demo) continue;
    const placeId = resolveGooglePlaceId(e.google_place_id, e.google_review_url);
    if (!placeId) continue;
    const stats = await fetchListingStats(placeId);
    return stats ? { ...stats, establishmentName: e.name } : null;
  }
  return null;
}
