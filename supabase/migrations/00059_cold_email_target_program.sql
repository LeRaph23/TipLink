-- Cold-email funnel: support two parallel target programs (ambassador, commercial)
--
-- Splits the existing single-funnel `cold_email_prospects` into a generic
-- prospect table indexed by (siret, target_program). A SIRET can legitimately
-- appear in both programs (an auto-entrepreneur could be both a candidate
-- ambassador and a commercial pro contact). Existing rows are tagged as
-- `ambassador` to keep behaviour unchanged.

ALTER TABLE public.cold_email_prospects
  ADD COLUMN IF NOT EXISTS target_program text NOT NULL DEFAULT 'ambassador'
    CHECK (target_program IN ('ambassador','commercial'));

-- Drop the SIRET-only unique constraint and replace with a composite
-- (siret, target_program) one. Allows the same SIRET to be a prospect in
-- both programs. NULL siret (manual prospects) is still allowed multiply.
DO $$
DECLARE
  cname text;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'public.cold_email_prospects'::regclass
    AND contype = 'u'
    AND pg_get_constraintdef(oid) ILIKE 'UNIQUE (siret)';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.cold_email_prospects DROP CONSTRAINT %I', cname);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_cold_email_prospects_siret_program
  ON public.cold_email_prospects (siret, target_program)
  WHERE siret IS NOT NULL;

-- New batch-send index: the cron will SELECT by (target_program, sequence_step,
-- last_sent_at) filtering out unsubscribed / replied. Partial index keeps it tiny.
CREATE INDEX IF NOT EXISTS idx_cold_email_prospects_program_send
  ON public.cold_email_prospects (target_program, sequence_step, last_sent_at)
  WHERE unsubscribed_at IS NULL AND replied_at IS NULL AND email IS NOT NULL;
