-- Ambassador banking + payouts + recruitment applications.
--
-- Ambassadors can connect a Stripe Custom account (SIRET required) and
-- request payouts of their accrued commissions + closed-week bonuses,
-- with a 30€ minimum. Super-admin marks payouts as paid once Stripe confirms.

-- ─── ambassador columns ──────────────────────────────────────────────────────
ALTER TABLE public.ambassadors
  ADD COLUMN IF NOT EXISTS siret             text,
  ADD COLUMN IF NOT EXISTS stripe_account_id text,
  ADD COLUMN IF NOT EXISTS onboarding_status text NOT NULL DEFAULT 'not_started',
  ADD COLUMN IF NOT EXISTS email             text,
  ADD COLUMN IF NOT EXISTS phone             text,
  ADD COLUMN IF NOT EXISTS city              text;

CREATE INDEX IF NOT EXISTS idx_ambassadors_stripe_account
  ON public.ambassadors(stripe_account_id);

-- ─── ambassador_payouts ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ambassador_payouts (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  ambassador_id        uuid        NOT NULL REFERENCES public.ambassadors(id) ON DELETE CASCADE,
  amount_cents         integer     NOT NULL CHECK (amount_cents >= 3000),
  status               text        NOT NULL DEFAULT 'pending'
                                   CHECK (status IN ('pending', 'paid', 'failed', 'canceled')),
  stripe_transfer_id   text,
  stripe_payout_id     text,
  failure_reason       text,
  requested_at         timestamptz NOT NULL DEFAULT now(),
  paid_at              timestamptz
);

CREATE INDEX IF NOT EXISTS idx_ambassador_payouts_ambassador
  ON public.ambassador_payouts(ambassador_id, requested_at DESC);

CREATE INDEX IF NOT EXISTS idx_ambassador_payouts_status
  ON public.ambassador_payouts(status, requested_at DESC);

ALTER TABLE public.ambassador_payouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ambassador_payouts_super_admin_all" ON public.ambassador_payouts
  FOR ALL TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- ─── ambassador_recruitment_applications ─────────────────────────────────────
-- Submissions to the hidden recruitment page. Reviewed by super-admin.
CREATE TABLE IF NOT EXISTS public.ambassador_recruitment_applications (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name       text        NOT NULL,
  last_name        text        NOT NULL,
  city             text        NOT NULL,
  phone            text        NOT NULL,
  email            text        NOT NULL,
  siret            text        NOT NULL,
  no_fraud_pledge  boolean     NOT NULL,
  notes            text,
  status           text        NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending', 'accepted', 'rejected')),
  reviewed_at      timestamptz,
  ip_hash          text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recruitment_applications_status
  ON public.ambassador_recruitment_applications(status, created_at DESC);

ALTER TABLE public.ambassador_recruitment_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "recruitment_applications_super_admin_all"
  ON public.ambassador_recruitment_applications
  FOR ALL TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());
