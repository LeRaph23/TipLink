-- ============================================================
-- Public RPC: get_public_group_staff(uuid)
--
-- Returns the list of payable staff for a given establishment
-- so the /pay/group/[establishmentId] landing page can render a
-- "pick a team member to tip" view (used when an NFC tag on a
-- table is scanned before being assigned to a specific staff).
--
-- Runs as SECURITY DEFINER and only exposes whitelisted columns.
-- ============================================================

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
  is_payable boolean
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
      AND s.stripe_account_id IS NOT NULL
      AND s.onboarding_status = 'complete'
    ) AS is_payable
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
