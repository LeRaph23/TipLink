-- Prospects tracker: extend cold_email_prospects with manual fields
-- so super-admin can hand-curate a CRM-style table on top of the SIRENE
-- scraper output (LinkedIn URL, manual email/notes, contact status).

ALTER TABLE public.cold_email_prospects
  ADD COLUMN IF NOT EXISTS linkedin_url text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'not_contacted'
    CHECK (status IN ('not_contacted', 'contacted', 'in_discussion', 'accepted', 'refused'));

-- Allow fully manual prospects (no SIRET available yet).
ALTER TABLE public.cold_email_prospects ALTER COLUMN siret DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cold_email_prospects_status
  ON public.cold_email_prospects(status);
