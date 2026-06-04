-- Default tip presets are now 5 / 10 / 20 (was 1 / 2 / 5 / 10). Update the
-- public RPC fallbacks and migrate existing groups that are still on the old
-- default. Groups that customised their thresholds (anything other than the old
-- default) are left untouched.

CREATE OR REPLACE FUNCTION public.get_public_staff(p_staff_id uuid)
 RETURNS TABLE(id uuid, full_name text, avatar_url text, establishment_name text, establishment_currency character, tip_thresholds jsonb, is_payable boolean)
 LANGUAGE sql STABLE SECURITY DEFINER
AS $function$
  SELECT
    s.id,
    s.full_name,
    s.avatar_url,
    e.name,
    e.currency,
    COALESCE(g.settings->'tip_thresholds', '[5,10,20]'::jsonb),
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
$function$;

CREATE OR REPLACE FUNCTION public.get_public_group_staff(p_establishment_id uuid)
 RETURNS TABLE(establishment_id uuid, establishment_name text, establishment_currency character, group_logo_url text, tip_thresholds jsonb, staff_id uuid, full_name text, avatar_url text, is_payable boolean)
 LANGUAGE sql STABLE SECURITY DEFINER
AS $function$
  SELECT
    e.id AS establishment_id,
    e.name AS establishment_name,
    e.currency AS establishment_currency,
    g.logo_url AS group_logo_url,
    COALESCE(g.settings->'tip_thresholds', '[5,10,20]'::jsonb) AS tip_thresholds,
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
$function$;

-- Migrate groups still on the previous default.
UPDATE public.groups
  SET settings = jsonb_set(settings, '{tip_thresholds}', '[5,10,20]'::jsonb)
  WHERE settings->'tip_thresholds' = '[1,2,5,10]'::jsonb;
