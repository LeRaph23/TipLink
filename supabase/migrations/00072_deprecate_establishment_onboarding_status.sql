-- ============================================================
-- Mark establishments.onboarding_status as deprecated.
--
-- The column is written exactly once, at INSERT, always as 'not_started'.
-- No code path anywhere updates it. Every super-admin screen that displayed
-- it therefore reported "not_started" for every establishment, permanently —
-- which is how an audit of the funnel concluded that nobody had completed
-- onboarding when in fact every group had.
--
-- The marker that is actually maintained is groups.onboarding_completed_at,
-- set by all three completion paths in actions/onboarding.ts.
--
-- Not dropped: staff_profiles.onboarding_status shares the same enum type and
-- is genuinely used (it gates is_payable in get_public_staff). Dropping this
-- column would also require regenerating types and touching the RLS test
-- fixtures, for no functional gain. A comment is enough to stop the next
-- person trusting it.
-- ============================================================

COMMENT ON COLUMN public.establishments.onboarding_status IS
  'DEPRECATED — never updated after INSERT. Do not read this to determine '
  'onboarding state; use groups.onboarding_completed_at instead.';
