-- Generalize the per-staff tip-transfer ledger so it covers BOTH solo and
-- group tips. Until now only group tips created per-staff rows; the deferred
-- onboarding model records a held allocation here for EVERY tip (solo
-- included), which is transferred to the staff member once their Stripe
-- account is ready.
--
-- This migration is a pure rename + index add — no behavioural change. The
-- application code is updated in the same change to use the new name, so the
-- migration must ship together with that code (do not apply it standalone
-- against a deployment still referencing `group_tip_transfers`).

ALTER TABLE public.group_tip_transfers RENAME TO tip_transfers;

ALTER INDEX IF EXISTS idx_gtt_txn RENAME TO idx_tt_txn;
ALTER INDEX IF EXISTS idx_gtt_staff RENAME TO idx_tt_staff;

ALTER POLICY "gtt_super_admin_all" ON public.tip_transfers RENAME TO "tt_super_admin_all";

-- Supports the "pending balance per staff" lookup (the upcoming "unlock my
-- tips" screen) and the reconciliation/expiry crons, which filter held rows
-- by staff and status.
CREATE INDEX IF NOT EXISTS idx_tt_staff_status ON public.tip_transfers(staff_id, status);
