-- ============================================================
-- Digitip Pro
--
-- Yes, `groups` carried subscription columns once before: 00006 added them and
-- 00017 dropped them when the model moved to hardware + per-tip commission.
-- They come back deliberately, for a different offer. The old one gated access
-- to the product itself; this one gates two things that sit beside it:
--
--   1. the Google review invitation shown after a tip
--   2. the payroll export beyond the current month, and its automatic monthly
--      delivery to the accountant
--
-- Nothing that increases tip volume is behind the paywall — that would be
-- charging the customer to reduce our own revenue. Which is also why the free
-- plan keeps its full history and analytics.
-- ============================================================

ALTER TABLE groups
  ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS subscription_status TEXT,
  ADD COLUMN IF NOT EXISTS subscription_current_period_end TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ,
  -- Where the monthly statement is sent, alongside the group admin.
  ADD COLUMN IF NOT EXISTS accountant_email TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'groups_plan_check') THEN
    ALTER TABLE groups ADD CONSTRAINT groups_plan_check CHECK (plan IN ('free', 'pro'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS groups_stripe_subscription_id_key
  ON groups (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

COMMENT ON COLUMN groups.plan IS
  'free | pro. Written by the Stripe subscription webhooks — never set it by hand outside a backfill.';
COMMENT ON COLUMN groups.accountant_email IS
  'Optional second recipient of the monthly payroll statement (Pro).';

-- ── The review invitation becomes a Pro feature ─────────────────────────────
-- Gating has to happen inside the function, not in the page: these RPCs are
-- callable by `anon`, so returning the URL and hiding it client-side would
-- leak it to anyone who reads the response.
--
-- The link is still collected during onboarding for everyone. A free group sees
-- a dashboard teaser counting the reviews it would have generated, which is a
-- far better argument than a greyed-out button.

CREATE OR REPLACE FUNCTION public.get_public_staff(p_staff_id uuid)
RETURNS TABLE (
  id uuid,
  full_name text,
  avatar_url text,
  establishment_name text,
  establishment_currency char(3),
  tip_thresholds jsonb,
  is_payable boolean,
  group_logo_url text,
  establishment_review_url text,
  establishment_is_demo boolean,
  fee_fixed_cents integer,
  fee_bps integer
) LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT
    s.id,
    s.full_name,
    s.avatar_url,
    e.name,
    e.currency,
    COALESCE(g.settings->'tip_thresholds', '[1,2,5,10]'::jsonb),
    (
      s.is_active
      AND s.deleted_at IS NULL
      AND e.deleted_at IS NULL
      AND g.deleted_at IS NULL
      AND (
        e.is_demo
        OR (
          e.stripe_account_id IS NOT NULL
          AND e.stripe_charges_enabled
          AND e.stripe_payouts_enabled
        )
      )
    ),
    g.logo_url,
    CASE WHEN g.plan = 'pro' THEN e.google_review_url ELSE NULL END,
    e.is_demo,
    g.platform_fixed_fee_cents,
    g.platform_fee_bps
  FROM staff_profiles s
  JOIN establishments e ON e.id = s.establishment_id
  JOIN groups g ON g.id = e.group_id
  WHERE s.id = p_staff_id;
$$;

REVOKE ALL ON FUNCTION public.get_public_staff(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_staff(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_public_establishment_review(p_establishment_id uuid)
RETURNS TABLE (
  establishment_name text,
  establishment_review_url text
) LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT
    e.name,
    CASE WHEN g.plan = 'pro' THEN e.google_review_url ELSE NULL END
  FROM establishments e
  JOIN groups g ON g.id = e.group_id
  WHERE e.id = p_establishment_id
    AND e.deleted_at IS NULL
    AND g.deleted_at IS NULL;
$$;

REVOKE ALL ON FUNCTION public.get_public_establishment_review(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_establishment_review(uuid) TO anon, authenticated;
