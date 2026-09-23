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

-- ---------------------------------------------------------------------------
-- Payout safety: freeze flag, failure tracking, and the payout audit tables.
--
-- This block shipped as its own migration, but as a second `00043_*` file
-- alongside 00043_audit_fixes.sql. The Supabase CLI keys
-- `supabase_migrations.schema_migrations` on that numeric prefix and it is the
-- primary key, so only one of the pair could ever be recorded.
--
-- It cannot simply be renumbered upwards: 00075_tip_allocations.sql renames
-- `staff_payouts` to `establishment_payouts` and reshapes
-- `negative_balance_events`, so this block has to run *before* 00075, and every
-- prefix between 00042 and 00075 is taken. It lives here instead, in the
-- migration it actually shipped with — the two are 16 seconds apart in the
-- remote registry (20260515065202 and 20260515065218), one deployment.
--
-- Read the current shape of these objects in 00075, not here: this block is
-- the historical state that 00075 then migrates.
-- ---------------------------------------------------------------------------

ALTER TABLE public.staff_profiles
  ADD COLUMN IF NOT EXISTS payouts_frozen             boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_payout_failure_code   text,
  ADD COLUMN IF NOT EXISTS last_payout_failure_at     timestamptz;

CREATE TABLE IF NOT EXISTS public.staff_payouts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id            uuid NOT NULL REFERENCES public.staff_profiles(id),
  stripe_payout_id    text NOT NULL UNIQUE,
  amount              integer NOT NULL,
  status              text NOT NULL CHECK (status IN ('pending', 'paid', 'in_transit', 'failed', 'canceled')),
  failure_code        text,
  failure_message     text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  paid_at             timestamptz,
  failed_at           timestamptz
);

CREATE INDEX IF NOT EXISTS idx_staff_payouts_staff
  ON public.staff_payouts(staff_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_staff_payouts_status
  ON public.staff_payouts(status, created_at DESC);

ALTER TABLE public.staff_payouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_payouts_owner_select" ON public.staff_payouts;
CREATE POLICY "staff_payouts_owner_select" ON public.staff_payouts
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.staff_profiles sp
      WHERE sp.id = staff_payouts.staff_id AND sp.user_id = auth.uid()
    )
    OR is_super_admin()
  );

-- Ledger for cases where staff withdrew funds before a chargeback hit, leaving
-- the platform on the hook. Tracked for reconciliation, not auto-collected.
CREATE TABLE IF NOT EXISTS public.negative_balance_events (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id            uuid NOT NULL REFERENCES public.staff_profiles(id),
  transaction_id      uuid REFERENCES public.transactions(id),
  amount_owed         integer NOT NULL,
  dispute_id          text,
  status              text NOT NULL DEFAULT 'owed'
                       CHECK (status IN ('owed', 'recovered', 'written_off')),
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  resolved_at         timestamptz
);

CREATE INDEX IF NOT EXISTS idx_neg_bal_staff
  ON public.negative_balance_events(staff_id, status);

ALTER TABLE public.negative_balance_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "neg_bal_super_admin_all" ON public.negative_balance_events;
CREATE POLICY "neg_bal_super_admin_all" ON public.negative_balance_events
  FOR ALL TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());
