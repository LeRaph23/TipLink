-- Cold email prospects: add automatic enrichment fields.
--
-- SIRENE doesn't expose emails or websites — we have to enrich each prospect
-- via the public Recherche d'entreprises API (api.gouv.fr) + scraping of the
-- company website's /contact and /mentions-legales pages. This migration adds
-- the columns we need to store the enrichment result + a timestamp so we can
-- avoid re-enriching the same prospect twice.

ALTER TABLE public.cold_email_prospects
  ADD COLUMN IF NOT EXISTS website text,
  ADD COLUMN IF NOT EXISTS enrichment_attempted_at timestamptz,
  ADD COLUMN IF NOT EXISTS enrichment_source text;

-- Index to feed the "enrich next batch" worker — picks prospects that haven't
-- been touched yet, prioritising those without an email. Partial: skip
-- unsubscribed, replied, or already-enriched rows.
CREATE INDEX IF NOT EXISTS idx_cold_email_prospects_enrich_queue
  ON public.cold_email_prospects (target_program, enrichment_attempted_at, imported_at)
  WHERE enrichment_attempted_at IS NULL
    AND unsubscribed_at IS NULL
    AND replied_at IS NULL;
