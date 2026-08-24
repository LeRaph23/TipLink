-- ============================================================
-- Tip fee model: the tipper pays the fees, the recipient keeps 100%
--
-- Until now `platform_fee_bps` was a commission DEDUCTED from the tip: on a
-- 10 € tip the recipient got 9,50 € and the tipper paid a flat 25 c service
-- fee on top, which did not even cover Stripe's own fixed fee.
--
-- The model is inverted. The tipper now pays the whole cost of the
-- transaction on top of the tip they chose:
--
--     total = tip + platform_fixed_fee_cents + ceil(tip * platform_fee_bps / 10000)
--
-- `platform_fixed_fee_cents` mirrors Stripe's per-transaction fixed fee and is
-- passed straight through; `platform_fee_bps` now covers Stripe's percentage
-- fee plus the platform margin. Nothing is taken out of the tip, so the
-- recipient receives exactly the amount the customer chose.
--
-- The bps column keeps its name, its default (500) and its 0..1500 bound —
-- only its meaning changes, hence the COMMENT below. See lib/pricing/tip-fees.ts
-- for the canonical arithmetic, shared by the browser and the server.
-- ============================================================

ALTER TABLE groups
  ADD COLUMN IF NOT EXISTS platform_fixed_fee_cents INTEGER NOT NULL DEFAULT 25;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'groups_platform_fixed_fee_cents_check'
  ) THEN
    ALTER TABLE groups
      ADD CONSTRAINT groups_platform_fixed_fee_cents_check
      CHECK (platform_fixed_fee_cents >= 0 AND platform_fixed_fee_cents <= 500);
  END IF;
END $$;

COMMENT ON COLUMN groups.platform_fee_bps IS
  'Variable part of the service fee ADDED to the tip and paid by the tipper, in basis points of the tip. Since 00073 this is no longer deducted from the tip.';

COMMENT ON COLUMN groups.platform_fixed_fee_cents IS
  'Fixed part of the service fee ADDED to the tip and paid by the tipper, in cents. Mirrors Stripe''s per-transaction fixed fee.';

-- ── Expose the fee config to the unauthenticated tip pages ───────────────────
-- The tipper must see the exact total before paying, and the server validates
-- the amount against the same config. Without this the browser would have to
-- guess, and a group on a non-default rate would fail the amount check.
--
-- Adding columns changes the return type, which CREATE OR REPLACE cannot do —
-- drop first (same pattern as 00070/00071). `is_payable` is carried over from
-- 00071 unchanged; it moves to the establishment's Connect account in 00074.

DROP FUNCTION IF EXISTS public.get_public_staff(uuid);

CREATE FUNCTION public.get_public_staff(p_staff_id uuid)
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
      AND (s.stripe_account_id IS NOT NULL OR e.is_demo)
      AND (s.onboarding_status = 'complete' OR e.is_demo)
      AND e.deleted_at IS NULL
      AND g.deleted_at IS NULL
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

DROP FUNCTION IF EXISTS public.get_public_group_staff(uuid);

CREATE FUNCTION public.get_public_group_staff(p_establishment_id uuid)
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
      AND (s.stripe_account_id IS NOT NULL OR e.is_demo)
      AND (s.onboarding_status = 'complete' OR e.is_demo)
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
