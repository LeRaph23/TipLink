-- Payout safety: freeze flag, failure tracking, and per-staff payout audit.
-- Used by:
--  - actions/stripe.ts requestPayout: refuses when payouts_frozen=true
--    and enforces the 3-day hold period.
--  - app/api/webhooks/stripe/route.ts: charge.dispute.created freezes the
--    staff member; payout.failed records failure metadata; payout.paid
--    records success.

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

CREATE POLICY "neg_bal_super_admin_all" ON public.negative_balance_events
  FOR ALL TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());
