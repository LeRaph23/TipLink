-- 00059 created a *partial* unique index on (siret, target_program) that
-- PostgreSQL can't match in an ON CONFLICT clause unless the client also
-- specifies the matching WHERE predicate. The Supabase JS upsert() API
-- doesn't expose that predicate, so every insert raised:
--   "there is no unique or exclusion constraint matching the ON CONFLICT specification"
-- Replace the partial index with a non-partial UNIQUE CONSTRAINT.
-- Postgres NULL semantics already treat multiple NULL siret rows as distinct,
-- so manual prospects without a SIRET stay allowed under both programmes.

DROP INDEX IF EXISTS public.uq_cold_email_prospects_siret_program;

ALTER TABLE public.cold_email_prospects
  ADD CONSTRAINT cold_email_prospects_siret_program_uniq
  UNIQUE (siret, target_program);
