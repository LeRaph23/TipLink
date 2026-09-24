-- A team tip can go through before anyone has joined.
--
-- Found by the fifth QA run: an establishment verified and ready to take tips
-- showed "Aucun membre de l'équipe n'est encore prêt" on its tag page until an
-- employee had accepted their invitation, so the first customers could not
-- tip at all. The money goes to the establishment's account whoever is on the
-- team; the per-person split is only attribution. A team tip is therefore
-- split across every member the manager added (joined or still invited), and
-- the tip pages need to know that team size and whether the establishment can
-- be paid, independently of the joined members they list by name.
--
-- The rows themselves are unchanged (joined members only, by name), so invited
-- people's names are still never exposed publicly.

DROP FUNCTION IF EXISTS public.get_public_group_staff(uuid);

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
  fee_bps integer,
  establishment_payable boolean,
  team_size integer
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
    g.platform_fee_bps AS fee_bps,
    (
      e.is_demo
      OR (
        e.stripe_account_id IS NOT NULL
        AND e.stripe_charges_enabled
        AND e.stripe_payouts_enabled
      )
    ) AS establishment_payable,
    (
      SELECT count(*)::integer FROM staff_profiles m
      WHERE m.establishment_id = e.id AND m.deleted_at IS NULL
    ) AS team_size
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
