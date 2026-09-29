-- A tag bought online is attached to its establishment before it ships, so a
-- scan used to skip the setup wizard entirely: the proxy only sent unassigned
-- stock tags to onboarding, and every assigned tag to the tip page. A manager
-- who had not yet set up his account scanned his own plaque and landed on a
-- customer tip page showing his own name and "no one on the team is ready yet",
-- with nothing to do (found in production, September 2026).
--
-- The resolver now also says whether the owning group has finished onboarding,
-- so the proxy can send the scan of a not-yet-activated plaque to the
-- activation flow instead. The first column is unchanged, so callers that read
-- only establishment_id keep working.

DROP FUNCTION IF EXISTS public.resolve_sticker_establishment(text);

CREATE FUNCTION public.resolve_sticker_establishment(p_short_id text)
 RETURNS TABLE (establishment_id uuid, group_id uuid, group_onboarded boolean)
 LANGUAGE sql STABLE SECURITY DEFINER
 SET search_path = public
AS $function$
  SELECT
    n.establishment_id,
    e.group_id,
    -- NULL (not false) when the establishment or its group is gone, so a tag
    -- left on a deleted establishment is not mistaken for one awaiting setup.
    CASE WHEN g.id IS NULL THEN NULL ELSE g.onboarding_completed_at IS NOT NULL END AS group_onboarded
  FROM nfc_stickers n
  LEFT JOIN establishments e ON e.id = n.establishment_id AND e.deleted_at IS NULL
  LEFT JOIN groups g ON g.id = e.group_id
  WHERE lower(n.short_id) = lower(p_short_id)
  LIMIT 1;
$function$;

-- Service role only, as before (see 00065).
REVOKE ALL ON FUNCTION public.resolve_sticker_establishment(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_sticker_establishment(text) TO service_role;
