-- Integrity guard for tip allocations: one row per (transaction_id, staff_id).
--
-- The Stripe webhook creates a `group_tip_transfers` row per recipient when a
-- tip succeeds. The old code used a check-then-insert ("does any row exist for
-- this transaction?") which is NOT atomic: two parallel deliveries of the same
-- payment_intent.succeeded event could both see zero rows and both insert,
-- duplicating the allocation. A duplicate could not double-pay (the Stripe
-- transfer uses `source_transaction`, which caps total transfers at the charge
-- amount) but it corrupts the ledger. This unique index turns the webhook's
-- upsert into a true ON CONFLICT DO NOTHING no-op.
--
-- Defensive de-dup first: should any historical duplicates exist, keep the most
-- progressed row per (transaction_id, staff_id) — a succeeded/failed transfer
-- (carrying a stripe_transfer_id) outranks a still-pending one; ties break on
-- the earliest created_at — and delete the rest, so the unique index can build.

WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY transaction_id, staff_id
      ORDER BY
        (stripe_transfer_id IS NOT NULL) DESC,  -- keep rows that moved money
        created_at ASC                          -- then the earliest
    ) AS rn
  FROM public.group_tip_transfers
)
DELETE FROM public.group_tip_transfers g
USING ranked r
WHERE g.id = r.id
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_gtt_txn_staff
  ON public.group_tip_transfers (transaction_id, staff_id);
