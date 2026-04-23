-- ============================================================
-- Public RPC: get_public_staff(uuid)
--
-- Returns only the sanitized, whitelisted fields needed to render
-- the public tip page at /pay/[staffId]. Runs as SECURITY DEFINER
-- so RLS does not apply, but the function itself only ever exposes
-- the columns listed in its signature. Never exposes
-- stripe_account_id, user_id, or establishment_id.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_public_staff(p_staff_id uuid)
RETURNS TABLE (
  id uuid,
  full_name text,
  avatar_url text,
  establishment_name text,
  establishment_currency char(3),
  tip_thresholds jsonb,
  is_payable boolean
) LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT
    s.id,
    s.full_name,
    s.avatar_url,
    e.name,
    e.currency,
    -- tip_thresholds lives on `groups.settings` (establishments has no settings column)
    COALESCE(g.settings->'tip_thresholds', '[1,2,5,10]'::jsonb),
    (
      s.is_active
      AND s.deleted_at IS NULL
      AND s.stripe_account_id IS NOT NULL
      AND s.onboarding_status = 'complete'
      AND e.deleted_at IS NULL
      AND g.deleted_at IS NULL
    )
  FROM staff_profiles s
  JOIN establishments e ON e.id = s.establishment_id
  JOIN groups g ON g.id = e.group_id
  WHERE s.id = p_staff_id;
$$;

REVOKE ALL ON FUNCTION public.get_public_staff(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_staff(uuid) TO anon, authenticated;
