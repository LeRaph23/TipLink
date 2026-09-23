-- Make stuck tips visible to the crons that are supposed to rescue them.
--
-- `transactions.transfer_status` was documented as "NULL before the charge
-- succeeds", and the webhook was expected to move it to 'succeeded' or
-- 'failed'. Nothing ever wrote 'pending'. But all three readers filter on
-- `transfer_status IN ('pending','failed')`:
--
--   app/api/cron/group-transfers-reconcile  (replays the transfer)
--   app/api/cron/unclaimed-tips-expire      (refunds the customer)
--   lib/stripe/establishment-account.ts     (shows the manager held funds)
--
-- So any tip whose webhook transfer block did not run kept transfer_status
-- NULL and became invisible to every one of them. The charge succeeded, the
-- money sat on the platform balance, the employee was credited in
-- tip_allocations, and nothing anywhere would ever pick it up again. Stripe
-- got its 200, so it never retried either.
--
-- Two things happen here. Going forward, both intent routes now write
-- 'pending' at creation. Looking backwards, this migration adopts the rows
-- that are already stranded, which is the part that actually returns money to
-- people: it is the only way those tips re-enter the reconcile cron.

-- A charge that succeeded with no transfer against it is exactly what
-- 'pending' means. Rows still awaiting payment keep NULL, and the crons ignore
-- them anyway because they also require status = 'succeeded'.
UPDATE public.transactions
SET transfer_status = 'pending'
WHERE status = 'succeeded'
  AND stripe_transfer_id IS NULL
  AND transfer_status IS NULL;

-- The old partial index covered only ('pending','failed'), so it could not
-- serve a query that also has to consider NULL. The crons keep reading NULL as
-- well as the named states, deliberately: the failure above was a value nobody
-- expected to be missing, and a safety net that only catches the cases someone
-- remembered is how it went unnoticed in the first place.
CREATE INDEX IF NOT EXISTS idx_transactions_transfer_needs_attention
  ON public.transactions (created_at)
  WHERE stripe_transfer_id IS NULL
    AND (transfer_status IS NULL OR transfer_status IN ('pending', 'failed'));

COMMENT ON COLUMN public.transactions.transfer_status IS
  'State of the single transfer of this tip to the establishment. Set to pending at intent creation; the webhook moves it to succeeded or failed. NULL only on rows predating migration 00080.';
