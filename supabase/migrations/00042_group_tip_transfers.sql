-- Track each Stripe transfer created for group tips, so that on refund or
-- dispute we can reverse exactly those transfers (one per staff member).
-- Without this, the per-member transfers from app/api/webhooks/stripe/route.ts
-- (group tip path) are fire-and-forget and cannot be reversed individually.

CREATE TABLE IF NOT EXISTS public.group_tip_transfers (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id       uuid NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  staff_id             uuid NOT NULL REFERENCES public.staff_profiles(id),
  stripe_transfer_id   text NOT NULL UNIQUE,
  amount               integer NOT NULL,
  reversed_at          timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gtt_txn ON public.group_tip_transfers(transaction_id);
CREATE INDEX IF NOT EXISTS idx_gtt_staff ON public.group_tip_transfers(staff_id);

ALTER TABLE public.group_tip_transfers ENABLE ROW LEVEL SECURITY;

-- Super admin can see everything for reconciliation. Staff don't need to see
-- this table directly — they see the parent transaction. The platform
-- service role (used by webhooks and server actions) bypasses RLS.
CREATE POLICY "gtt_super_admin_all" ON public.group_tip_transfers
  FOR ALL TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());
