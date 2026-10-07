-- ============================================================
-- Prospect salons: keep the Google place ID, nothing else
--
-- Google's Places API terms allow storing the place ID indefinitely and no
-- other Places content. Migration 00037 stored a matched listing's rating,
-- review count, opening hours and business status, and the enrichment also
-- overwrote the salon's phone, website and address with Google's. All of that
-- goes here.
--
-- Kept: google_place_id (allowed), google_enriched_at (our own bookkeeping,
-- so a salon is not re-queried every click), and is_active = false on the
-- salons Google reported closed for good: that is our decision to stop
-- canvassing them, not a copy of Google's data.
--
-- Lost for the matched salons (about 200 of 32,000): phone and website, which
-- had come from Google. Their address comes back from OpenStreetMap with
-- "Enrichir les adresses (Nominatim)" in the terrain admin, which
-- reverse-geocodes every salon that has none.
-- ============================================================

UPDATE public.salons
SET phone = NULL, website = NULL, address = NULL
WHERE google_place_id IS NOT NULL;

ALTER TABLE public.salons
  DROP COLUMN IF EXISTS business_status,
  DROP COLUMN IF EXISTS opening_hours,
  DROP COLUMN IF EXISTS google_rating,
  DROP COLUMN IF EXISTS google_user_ratings_total;
