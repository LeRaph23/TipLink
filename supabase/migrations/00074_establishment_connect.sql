-- ============================================================
-- One Stripe Connect account per establishment
--
-- Until now every staff member had to create their own Stripe Standard
-- account and go through Stripe-hosted KYC before they could be tipped. That
-- was the single biggest source of drop-off, and it multiplied Connect's
-- per-account cost by the size of the team.
--
-- From here on the ESTABLISHMENT holds one connected account and receives
-- every tip; who earned what is tracked internally (see 00075) and settled
-- through payroll. `establishments.stripe_account_id` has existed since 00001
-- but was never written — this migration puts it to work and adds the
-- capability flags mirrored from Stripe's `account.updated` webhook.
--
-- Note: `establishments.onboarding_status` is deliberately NOT reused. 00072
-- documented it as dead (written once at INSERT, never updated); reviving it
-- would resurrect exactly the ambiguity that migration removed.
-- ============================================================

ALTER TABLE establishments
  ADD COLUMN IF NOT EXISTS stripe_charges_enabled   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_payouts_enabled   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_details_submitted BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_requirements      JSONB,
  ADD COLUMN IF NOT EXISTS stripe_synced_at         TIMESTAMPTZ;

COMMENT ON COLUMN establishments.stripe_account_id IS
  'Stripe Connect account holding every tip for this establishment. One per establishment since 00074.';
COMMENT ON COLUMN establishments.stripe_details_submitted IS
  'Mirrors account.details_submitted — the onboarding form was completed. Gates finishing the setup wizard.';
COMMENT ON COLUMN establishments.stripe_charges_enabled IS
  'Mirrors account.charges_enabled. With stripe_payouts_enabled, gates the public tip pages.';

-- One account can only ever back one establishment; a duplicate would silently
-- route another establishment's tips into the wrong bank account.
CREATE UNIQUE INDEX IF NOT EXISTS establishments_stripe_account_id_key
  ON establishments (stripe_account_id)
  WHERE stripe_account_id IS NOT NULL;

-- Fast lookup from the webhook, which only carries the Stripe account id.
CREATE INDEX IF NOT EXISTS idx_establishments_stripe_account
  ON establishments (stripe_account_id)
  WHERE stripe_account_id IS NOT NULL;

-- ── is_payable now depends on the establishment, not the staff member ────────
-- A staff member is tippable when their establishment can both take charges
-- and pay out. Staff no longer carry a Stripe account at all, so the old
-- `s.stripe_account_id IS NOT NULL AND s.onboarding_status = 'complete'`
-- condition would now be false for everyone.
--
-- Demo establishments stay payable so the fake-payment flow keeps working.
-- Return type unchanged from 00073, but the body changes — replace in place.

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
    e.google_review_url,
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

CREATE OR REPLACE FUNCTION public.get_public_group_staff(p_establishment_id uuid)
RETURNS TABLE (
  establishment_id uuid,
  establishment_name text,
  establishment_currency char(3),
  group_logo_url text,
  tip_thresholds jsonb,
  staff_id uuid,
  full_name text,
  avatar_url text,
  is_payable boolean,
  establishment_is_demo boolean,
  fee_fixed_cents integer,
  fee_bps integer
) LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT
    e.id AS establishment_id,
    e.name AS establishment_name,
    e.currency AS establishment_currency,
    g.logo_url AS group_logo_url,
    COALESCE(g.settings->'tip_thresholds', '[1,2,5,10]'::jsonb) AS tip_thresholds,
    s.id AS staff_id,
    s.full_name,
    s.avatar_url,
    (
      s.is_active
      AND s.deleted_at IS NULL
      AND (
        e.is_demo
        OR (
          e.stripe_account_id IS NOT NULL
          AND e.stripe_charges_enabled
          AND e.stripe_payouts_enabled
        )
      )
    ) AS is_payable,
    e.is_demo AS establishment_is_demo,
    g.platform_fixed_fee_cents AS fee_fixed_cents,
    g.platform_fee_bps AS fee_bps
  FROM establishments e
  JOIN groups g ON g.id = e.group_id
  LEFT JOIN staff_profiles s
    ON s.establishment_id = e.id
    AND s.is_active
    AND s.deleted_at IS NULL
  WHERE e.id = p_establishment_id
    AND e.deleted_at IS NULL
    AND g.deleted_at IS NULL
  ORDER BY s.full_name NULLS LAST;
$$;

REVOKE ALL ON FUNCTION public.get_public_group_staff(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_group_staff(uuid) TO anon, authenticated;

-- ── Deprecate the staff-level Connect columns ───────────────────────────────
-- Kept so historical rows stay readable and so a rollback does not lose data,
-- but nothing reads them any more. Same treatment 00072 gave
-- establishments.onboarding_status.
COMMENT ON COLUMN staff_profiles.stripe_account_id IS
  'DEPRECATED since 00074. Staff no longer hold a Stripe account — the establishment does. Do not read.';
COMMENT ON COLUMN staff_profiles.onboarding_status IS
  'DEPRECATED since 00074. Payability is now decided by the establishment''s Connect account. Do not read.';
