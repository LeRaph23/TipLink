-- ============================================================
-- The per-staff ledger becomes an accounting record, not a transfer queue
--
-- `group_tip_transfers` used to hold one row per staff member per tip, each
-- backed by its own Stripe transfer into that person's connected account. With
-- one account per establishment there is exactly ONE transfer per tip, and the
-- per-staff rows stop being payment instructions: they become the record of who
-- earned what, which is what the payroll export is built on.
--
-- The name was already misleading — 00062 made the table hold solo tips too, so
-- "group_" has been wrong for a while. Renaming it now, while the semantics
-- change anyway, is cheaper than carrying the confusion forever.
--
-- Postgres carries indexes, constraints and RLS policies through a table
-- rename; only their names stay stale, so they are renamed alongside.
-- ============================================================

ALTER TABLE public.group_tip_transfers RENAME TO tip_allocations;

ALTER TABLE public.tip_allocations RENAME COLUMN transferred_at TO allocated_at;

COMMENT ON TABLE public.tip_allocations IS
  'Who earned what, per tip. Internal accounting only since 00075 — no Stripe transfer is attached to a row. The single transfer to the establishment lives on transactions.stripe_transfer_id.';

-- Before dropping the per-staff transfer columns, carry any transfer that
-- actually happened up onto its transaction. Under the old model a tip could
-- produce several (one per colleague); in practice only single-recipient tips
-- were ever settled, so the first one is the whole story. Losing these ids
-- would leave historical tips with no traceable Stripe movement at all.
UPDATE public.transactions t
SET stripe_transfer_id = a.stripe_transfer_id
FROM (
  SELECT DISTINCT ON (transaction_id) transaction_id, stripe_transfer_id
  FROM public.tip_allocations
  WHERE stripe_transfer_id IS NOT NULL
  ORDER BY transaction_id, created_at
) AS a
WHERE t.id = a.transaction_id
  AND t.stripe_transfer_id IS NULL;

-- These three described a per-staff Stripe transfer that no longer happens.
ALTER TABLE public.tip_allocations
  DROP COLUMN IF EXISTS stripe_transfer_id,
  DROP COLUMN IF EXISTS attempts,
  DROP COLUMN IF EXISTS error;

-- 'pending' meant "waiting for this employee to finish onboarding". Nothing
-- waits any more: the establishment is verified before its first tip, so a row
-- is written already allocated. Existing rows are migrated accordingly.
--
-- The old constraint has to go FIRST — it still forbids 'allocated', so
-- rewriting the rows under it fails on the very first one.
ALTER TABLE public.tip_allocations DROP CONSTRAINT IF EXISTS group_tip_transfers_status_check;

UPDATE public.tip_allocations SET status = 'allocated' WHERE status IN ('pending', 'succeeded');
UPDATE public.tip_allocations SET status = 'reversed' WHERE status = 'failed';

ALTER TABLE public.tip_allocations
  ADD CONSTRAINT tip_allocations_status_check
  CHECK (status IN ('allocated', 'reversed'));

ALTER TABLE public.tip_allocations ALTER COLUMN status SET DEFAULT 'allocated';

-- Rename the carried-over objects so the schema reads consistently.
-- Partial on ('pending','failed'), neither of which survives the new CHECK, so
-- it can never match another row again.
DROP INDEX IF EXISTS idx_gtt_pending;

ALTER INDEX IF EXISTS idx_gtt_txn RENAME TO idx_tip_alloc_txn;
ALTER INDEX IF EXISTS idx_gtt_staff RENAME TO idx_tip_alloc_staff;
ALTER INDEX IF EXISTS idx_gtt_staff_status RENAME TO idx_tip_alloc_staff_status;
ALTER INDEX IF EXISTS idx_gtt_transferred_at RENAME TO idx_tip_alloc_allocated_at;
ALTER INDEX IF EXISTS uniq_gtt_txn_staff RENAME TO uniq_tip_alloc_txn_staff;
ALTER POLICY "gtt_super_admin_all" ON public.tip_allocations RENAME TO "tip_alloc_super_admin_all";

-- ── The transfer state moves onto the transaction ───────────────────────────
-- One transfer per tip now, so its retry state belongs next to the charge.
-- `transactions.stripe_transfer_id` already exists (00041).
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS transfer_status   TEXT,
  ADD COLUMN IF NOT EXISTS transfer_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS transfer_error    TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'transactions_transfer_status_check'
  ) THEN
    ALTER TABLE public.transactions
      ADD CONSTRAINT transactions_transfer_status_check
      CHECK (transfer_status IS NULL OR transfer_status IN ('pending', 'succeeded', 'failed', 'reversed'));
  END IF;
END $$;

COMMENT ON COLUMN public.transactions.transfer_status IS
  'State of the single transfer of this tip to the establishment. NULL before the charge succeeds.';

-- Historical tips whose transfer was carried up above are already settled.
-- Marking them keeps them out of the reconcile cron's retry window for good,
-- rather than relying on transfer_status staying NULL.
UPDATE public.transactions
SET transfer_status = 'succeeded'
WHERE stripe_transfer_id IS NOT NULL
  AND transfer_status IS NULL;

-- Drives the reconcile cron, which replays transfers that failed.
CREATE INDEX IF NOT EXISTS idx_transactions_transfer_retry
  ON public.transactions (transfer_status, created_at)
  WHERE transfer_status IN ('pending', 'failed');

-- ── Payout bookkeeping follows the money ────────────────────────────────────
-- Stripe pays out the establishment's connected account, not an employee's, so
-- `payout.*` events can no longer be resolved through staff_profiles. These
-- tables are write-only bookkeeping (nothing in the app reads them), which is
-- why the columns are repointed in place rather than migrated: any pre-existing
-- row belonged to the per-employee model and has no meaning under the new one.

-- The row-level policy selects through staff_id, so Postgres refuses to drop
-- the column while it exists. Dropped and rebuilt around the establishment.
DROP POLICY IF EXISTS staff_payouts_owner_select ON public.staff_payouts;

ALTER TABLE public.staff_payouts RENAME TO establishment_payouts;
DELETE FROM public.establishment_payouts;
ALTER TABLE public.establishment_payouts DROP COLUMN staff_id;
ALTER TABLE public.establishment_payouts
  ADD COLUMN establishment_id uuid NOT NULL REFERENCES public.establishments(id);

-- Payouts are now the establishment's business, so visibility follows the
-- people who manage it rather than the employee who used to own the account.
CREATE POLICY establishment_payouts_scoped_select ON public.establishment_payouts
  FOR SELECT USING (
    is_super_admin()
    OR establishment_id = ANY (get_my_managed_establishment_ids())
    OR EXISTS (
      SELECT 1 FROM public.establishments e
      WHERE e.id = establishment_payouts.establishment_id
        AND e.group_id = ANY (get_my_group_ids())
    )
  );

ALTER INDEX IF EXISTS idx_staff_payouts_status RENAME TO idx_establishment_payouts_status;
DROP INDEX IF EXISTS idx_staff_payouts_staff;
CREATE INDEX IF NOT EXISTS idx_establishment_payouts_estab
  ON public.establishment_payouts(establishment_id, created_at DESC);

DELETE FROM public.negative_balance_events;
ALTER TABLE public.negative_balance_events DROP COLUMN staff_id;
ALTER TABLE public.negative_balance_events
  ADD COLUMN establishment_id uuid NOT NULL REFERENCES public.establishments(id);

DROP INDEX IF EXISTS idx_neg_bal_staff;
CREATE INDEX IF NOT EXISTS idx_neg_bal_estab
  ON public.negative_balance_events(establishment_id, status);

COMMENT ON TABLE public.negative_balance_events IS
  'Chargebacks recorded against an establishment. Note that tips are separate charges, so a dispute debits the PLATFORM balance — this is a reconciliation trail, not a connected-account debt.';
