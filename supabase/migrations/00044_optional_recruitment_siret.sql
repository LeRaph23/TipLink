-- Make SIRET optional on ambassador applications.
-- A candidate can apply without a SIRET to reduce signup friction; it stays
-- mandatory later, at banking setup (components/ambassadeur/AmbassadeurBanking.tsx),
-- before any payout can be made.
-- Used by:
--  - app/api/ambassadeur/recruitment/route.ts: accepts a null/empty siret.

ALTER TABLE public.ambassador_recruitment_applications
  ALTER COLUMN siret DROP NOT NULL;
