-- Ambassador payout integrity — close the commission/bonus money leak.
--
-- Problem: ambassador_sales rows (and the weekly/monthly bonuses + referral
-- rewards derived from them) were created when a SmartTag pack order was paid,
-- but NEVER reversed when that order was later refunded, charged back, or
-- canceled. An ambassador — or a buyer colluding with one — could therefore
-- bank a 25/35€ commission (plus tier bonuses) on revenue the platform never
-- kept, and withdraw it via the self-serve payout route.
--
-- Fix:
--  * ambassador_sales gains a soft-void marker. Every commission / bonus /
--    leaderboard computation now filters voided rows out (done in app code).
--  * One sale per order, so a re-delivered Stripe webhook cannot double-credit.
--  * ambassadors.payouts_frozen lets a super-admin block one ambassador's
--    withdrawals without deactivating the whole account. The Stripe webhook
--    also sets it automatically when a pack purchase is disputed.

-- ─── ambassador_sales: soft void ─────────────────────────────────────────────
ALTER TABLE public.ambassador_sales
  ADD COLUMN IF NOT EXISTS voided_at   timestamptz,
  ADD COLUMN IF NOT EXISTS void_reason text;

-- Collapse any accidental duplicates before enforcing one-sale-per-order
-- (keeps the earliest physical row for each order).
DELETE FROM public.ambassador_sales a
  USING public.ambassador_sales b
 WHERE a.smarttag_order_id = b.smarttag_order_id
   AND a.ctid > b.ctid;

ALTER TABLE public.ambassador_sales
  DROP CONSTRAINT IF EXISTS ambassador_sales_order_unique;
ALTER TABLE public.ambassador_sales
  ADD CONSTRAINT ambassador_sales_order_unique UNIQUE (smarttag_order_id);

-- Hot path: per-ambassador queries of *live* (non-voided) commissions.
CREATE INDEX IF NOT EXISTS idx_ambassador_sales_live
  ON public.ambassador_sales(ambassador_id, created_at DESC)
  WHERE voided_at IS NULL;

-- ─── ambassadors: payout freeze ──────────────────────────────────────────────
ALTER TABLE public.ambassadors
  ADD COLUMN IF NOT EXISTS payouts_frozen boolean NOT NULL DEFAULT false;
