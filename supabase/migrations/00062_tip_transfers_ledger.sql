-- Generalize the per-staff transfer ledger (`group_tip_transfers`) so it also
-- holds allocations for SOLO tips, not just group tips. The deferred-onboarding
-- model records a held allocation row here for every tip; it is transferred to
-- the staff member once their Stripe account is ready.
--
-- No rename is performed: the table keeps its existing name to avoid a breaking
-- schema change on a live deployment. This migration is purely additive (a new
-- index) and is therefore safe to apply to a running database at any time.

-- Supports the "pending balance per staff" lookup (the upcoming "unlock my
-- tips" screen) and the reconciliation / expiry crons, which filter held rows
-- by staff and status.
CREATE INDEX IF NOT EXISTS idx_gtt_staff_status
  ON public.group_tip_transfers(staff_id, status);
