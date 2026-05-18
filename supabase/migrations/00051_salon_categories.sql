-- Establishment categories + client-conversion flag.
--
-- "Salons" widen to establishments: besides hair (coiffure) and beauty
-- (esthetique), the OSM scraper now also imports restaurants, cafes and bars.
-- Each row carries its category so the ambassador map can show a per-category
-- icon. converted_at marks an establishment that became a paying client.

ALTER TABLE public.salons
  ADD COLUMN IF NOT EXISTS category     text NOT NULL DEFAULT 'coiffure',
  ADD COLUMN IF NOT EXISTS converted_at timestamptz;

-- Idempotent re-add of the category whitelist.
ALTER TABLE public.salons DROP CONSTRAINT IF EXISTS salons_category_check;
ALTER TABLE public.salons
  ADD CONSTRAINT salons_category_check
  CHECK (category IN ('coiffure', 'esthetique', 'restaurant', 'cafe', 'bar'));

CREATE INDEX IF NOT EXISTS idx_salons_category ON public.salons(category);
