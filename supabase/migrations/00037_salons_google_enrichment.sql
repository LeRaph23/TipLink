-- Google Places enrichment: opening hours, business status, place id, rating.
-- Used to detect permanently closed salons and surface hours to ambassadors.

ALTER TABLE public.salons
  ADD COLUMN IF NOT EXISTS google_place_id            text,
  ADD COLUMN IF NOT EXISTS business_status            text
    CHECK (business_status IN ('OPERATIONAL', 'CLOSED_TEMPORARILY', 'CLOSED_PERMANENTLY')),
  ADD COLUMN IF NOT EXISTS opening_hours              jsonb,
  ADD COLUMN IF NOT EXISTS google_rating              numeric(2,1),
  ADD COLUMN IF NOT EXISTS google_user_ratings_total  integer,
  ADD COLUMN IF NOT EXISTS google_enriched_at         timestamptz;

-- One Google Place ID maps to one salon row (when known).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_salons_google_place_id
  ON public.salons(google_place_id)
  WHERE google_place_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_salons_business_status
  ON public.salons(business_status)
  WHERE business_status IS NOT NULL;
