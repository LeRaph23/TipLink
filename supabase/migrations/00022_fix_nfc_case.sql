-- Normalise short_id comparison to lowercase so that codes typed in any case
-- (e.g. from a printed label) still match the lowercase values stored in the DB.
CREATE OR REPLACE FUNCTION validate_unassigned_nfc_code(p_short_id TEXT)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT id FROM nfc_stickers
  WHERE short_id = lower(p_short_id)
    AND establishment_id IS NULL
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION validate_unassigned_nfc_code(TEXT) TO anon, authenticated;
