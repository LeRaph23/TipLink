-- Smarttag open speedup: make the /s/[shortId] lookup index-served.
--
-- The proxy middleware resolves a sticker by short_id case-insensitively (the
-- short_id printed on a tag may be matched in any case). Until now it used a
-- PostgREST `short_id=ilike.{shortId}` filter, which the case-sensitive unique
-- btree `idx_nfc_stickers_short_id` cannot serve → a sequential scan of
-- nfc_stickers on every single tag scan.
--
-- Add a functional index on lower(short_id) and a tiny SECURITY DEFINER RPC the
-- middleware can call, so the lookup is an index scan. Case-insensitivity is
-- preserved (short_ids are stored mixed-case: nanoid() batches + manual codes).
--
-- The index is intentionally NOT unique: the existing case-sensitive unique
-- index already enforces short_id uniqueness, and a non-unique functional index
-- can never fail to build on pre-existing case-insensitive collisions.

CREATE INDEX IF NOT EXISTS idx_nfc_stickers_short_id_lower
  ON public.nfc_stickers (lower(short_id));

CREATE OR REPLACE FUNCTION public.resolve_sticker_establishment(p_short_id text)
 RETURNS TABLE (establishment_id uuid)
 LANGUAGE sql STABLE SECURITY DEFINER
 SET search_path = public
AS $function$
  SELECT n.establishment_id
  FROM nfc_stickers n
  WHERE lower(n.short_id) = lower(p_short_id)
  LIMIT 1;
$function$;

-- Only the service role (used by the proxy middleware) may call this. It is not
-- exposed to anon / authenticated clients. Note: Supabase default privileges
-- auto-grant EXECUTE on new public functions to anon/authenticated, so they must
-- be revoked explicitly (REVOKE FROM PUBLIC alone is not enough).
REVOKE ALL ON FUNCTION public.resolve_sticker_establishment(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_sticker_establishment(text) TO service_role;
