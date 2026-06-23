-- ============================================================
-- Demo mode for establishments
--
-- An establishment flagged is_demo lets anyone go through the full tip UX
-- (amount selection → success → Google review prompt) WITHOUT a real charge:
-- the pay pages render a "fake payment" button that jumps straight to the
-- success screen. Used for sales demos so we don't pay Stripe fees every time.
--
-- Exposed (read-only) through the public tip RPCs so the unauthenticated pay
-- pages know whether to show the demo button.
-- ============================================================

ALTER TABLE establishments
  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

-- ── get_public_staff: add establishment_is_demo (adding a column changes the
--    return type, so drop first). ─────────────────────────────────────────────
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
  establishment_is_demo boolean
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
    e.is_demo
  FROM staff_profiles s
  JOIN establishments e ON e.id = s.establishment_id
  JOIN groups g ON g.id = e.group_id
  WHERE s.id = p_staff_id;
$$;

REVOKE ALL ON FUNCTION public.get_public_staff(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_staff(uuid) TO anon, authenticated;

-- ── get_public_group_staff: add establishment_is_demo ────────────────────────
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
  establishment_is_demo boolean
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
    e.is_demo AS establishment_is_demo
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
