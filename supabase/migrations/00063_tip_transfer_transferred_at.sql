-- Record WHEN each held allocation was actually paid out to the staff member.
-- The monthly employer statement must report tips by the month they were
-- received by the employee (the payout), not by the month the customer left
-- them — a salaried employee's tip is declarable income only once received, and
-- still-held allocations may yet be refunded (expiry), so they are not income.
--
-- Purely additive: safe to apply to a running database at any time.

ALTER TABLE public.group_tip_transfers
  ADD COLUMN IF NOT EXISTS transferred_at timestamptz;

-- Backfill rows already transferred before this column existed, so historical
-- statements aren't empty (created_at is a close proxy for the payout date).
UPDATE public.group_tip_transfers
  SET transferred_at = created_at
  WHERE status = 'succeeded' AND transferred_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_gtt_transferred_at
  ON public.group_tip_transfers(transferred_at);
