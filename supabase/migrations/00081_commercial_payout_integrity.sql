-- One pending payout per commercial, matching the ambassador programme.
--
-- Migration 00043 (now 00078's sibling, 00043_audit_fixes) added
-- `ambassador_payouts_one_pending_per_amb` to close the double-payout race on
-- the ambassador side. The Commerciaux Pros programme was built afterwards and
-- never got the equivalent, so two concurrent requests could both insert a
-- pending row and both transfer.
--
-- It also backs the payout routes' "indeterminate" branch: when Stripe cannot
-- confirm whether a transfer went through, the row is deliberately left
-- `pending` so the amount stays committed, and this index is what stops another
-- request being raised until a super-admin has resolved it.

CREATE UNIQUE INDEX IF NOT EXISTS commercial_payouts_one_pending_per_com
  ON public.commercial_payouts(commercial_id)
  WHERE status = 'pending';
