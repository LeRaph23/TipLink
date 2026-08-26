import { describe, it, expect } from 'vitest';
import { resolveGooglePlaceId } from '@/lib/google-places';

const ID = 'ChIJs_iBrUOZkUcRgmL1Fs_yKqg';

describe('resolveGooglePlaceId', () => {
  it('prefers the stored place id', () => {
    expect(resolveGooglePlaceId(ID, null)).toBe(ID);
    expect(resolveGooglePlaceId(ID, 'https://example.test/whatever')).toBe(ID);
  });

  // The column is only written when the manager picked a search result. Someone
  // who pasted a link by hand has the id in the review URL instead, and that is
  // the half of the accounts this fallback recovers.
  it('falls back to the id inside a review URL', () => {
    expect(
      resolveGooglePlaceId(null, `https://search.google.com/local/writereview?placeid=${ID}`),
    ).toBe(ID);
    // The canonical Maps place URL uses a colon, and normalizeGoogleReviewUrl
    // stores that shape untouched — so it has to be readable too.
    expect(
      resolveGooglePlaceId(null, `https://www.google.com/maps/place/?q=place_id:${ID}`),
    ).toBe(ID);
    expect(
      resolveGooglePlaceId(null, `https://www.google.com/maps?place_id=${ID}&hl=fr`),
    ).toBe(ID);
  });

  it('treats a blank stored id as absent', () => {
    expect(resolveGooglePlaceId('   ', `https://search.google.com/local/writereview?placeid=${ID}`)).toBe(ID);
  });

  it('returns null when there is nothing to read', () => {
    expect(resolveGooglePlaceId(null, null)).toBeNull();
    expect(resolveGooglePlaceId(undefined, undefined)).toBeNull();
    expect(resolveGooglePlaceId(null, 'https://g.page/mon-salon/review')).toBeNull();
  });
});
