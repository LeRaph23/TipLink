-- Fix: claim_nfc_stickers referenced nfc_stickers.staff_id, a column dropped
-- in migration 00014 (smarttag_establishment_only). The stale predicate made
-- the function fail at runtime with "column s.staff_id does not exist",
-- breaking NFC onboarding finalization (completeNfcOnboarding). A sticker is
-- "unassigned / in stock" when establishment_id IS NULL — the sole check now.
CREATE OR REPLACE FUNCTION public.claim_nfc_stickers(
  p_short_ids text[],
  p_establishment_id uuid
) RETURNS TABLE (id uuid, short_id text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH locked AS (
    SELECT s.id
      FROM public.nfc_stickers s
     WHERE lower(s.short_id) = ANY (
             SELECT lower(x) FROM unnest(p_short_ids) AS x
           )
       AND s.establishment_id IS NULL
     FOR UPDATE SKIP LOCKED
  )
  UPDATE public.nfc_stickers ns
     SET establishment_id = p_establishment_id,
         updated_at = now()
    FROM locked
   WHERE ns.id = locked.id
  RETURNING ns.id, ns.short_id;
END;
$$;

-- Server-side only — an anonymous caller must never be able to claim stickers.
REVOKE ALL ON FUNCTION public.claim_nfc_stickers(text[], uuid) FROM PUBLIC, anon, authenticated;
