-- ============================================================
-- Google review link for establishments
--
-- Lets an establishment store its Google "write a review" deep link so we can
-- prompt the tipper to leave a ⭐⭐⭐⭐⭐ review right after a successful tip —
-- the highest-converting moment (customer just chose to be generous).
--
-- We store both the raw place_id (so we can always rebuild the canonical link
-- or re-enrich later) and the ready-to-use review URL that the tip pages open.
-- ============================================================

ALTER TABLE establishments
  ADD COLUMN IF NOT EXISTS google_place_id TEXT,
  ADD COLUMN IF NOT EXISTS google_review_url TEXT;

-- ── Expose the review URL to the single-staff tip success page ────────────────
-- Extends get_public_staff (last redefined in 00023) with one extra column.
-- SECURITY DEFINER + a fixed column whitelist keep it safe for anon callers.
-- Adding a column changes the function's return type, which CREATE OR REPLACE
-- cannot do — drop the previous definition first.
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
  establishment_review_url text
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
      AND s.stripe_account_id IS NOT NULL
      AND s.onboarding_status = 'complete'
      AND e.deleted_at IS NULL
      AND g.deleted_at IS NULL
    ),
    g.logo_url,
    e.google_review_url
  FROM staff_profiles s
  JOIN establishments e ON e.id = s.establishment_id
  JOIN groups g ON g.id = e.group_id
  WHERE s.id = p_staff_id;
$$;

REVOKE ALL ON FUNCTION public.get_public_staff(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_staff(uuid) TO anon, authenticated;

-- ── Expose the review URL for the group tip flow ─────────────────────────────
-- The group tip PI carries establishment_id (not a single staff_id), so the
-- success page needs a way to fetch the review link from the establishment.
DROP FUNCTION IF EXISTS public.get_public_establishment_review(uuid);

CREATE FUNCTION public.get_public_establishment_review(p_establishment_id uuid)
RETURNS TABLE (
  establishment_name text,
  establishment_review_url text
) LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT e.name, e.google_review_url
  FROM establishments e
  JOIN groups g ON g.id = e.group_id
  WHERE e.id = p_establishment_id
    AND e.deleted_at IS NULL
    AND g.deleted_at IS NULL;
$$;

REVOKE ALL ON FUNCTION public.get_public_establishment_review(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_establishment_review(uuid) TO anon, authenticated;
