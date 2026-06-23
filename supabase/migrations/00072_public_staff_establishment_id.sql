-- ============================================================
-- Merge the staff tip page's two reads into one RPC round-trip
--
-- `/pay/[staffId]` needs the establishment_id (for the "tip the team" link and
-- the AmountSelector cross-tenant guard) in addition to the public profile.
-- It used to fetch it with a *second* PostgREST call to staff_profiles, so a
-- cold scan paid for two Supabase round-trips. get_public_staff already JOINs
-- establishments, so we just expose e.id and drop the extra query.
--
-- Adding a column changes the return type, so the function must be dropped and
-- recreated. Body is otherwise identical to 00071.
-- ============================================================

DROP FUNCTION IF EXISTS public.get_public_staff(uuid);

CREATE FUNCTION public.get_public_staff(p_staff_id uuid)
RETURNS TABLE (
  id uuid,
  full_name text,
  avatar_url text,
  establishment_id uuid,
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
    e.id,
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
