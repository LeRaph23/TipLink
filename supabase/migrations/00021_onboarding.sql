-- Add address to establishments for onboarding wizard
ALTER TABLE establishments
  ADD COLUMN IF NOT EXISTS address TEXT;

-- Add onboarding completion sentinel to groups
ALTER TABLE groups
  ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ;

-- Public RPC for validating an unassigned NFC code during unauthenticated onboarding.
-- SECURITY DEFINER so the anon key can call it (RLS would otherwise block the table read).
CREATE OR REPLACE FUNCTION validate_unassigned_nfc_code(p_short_id TEXT)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT short_id FROM nfc_stickers
  WHERE short_id = p_short_id
    AND establishment_id IS NULL
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION validate_unassigned_nfc_code(TEXT) TO anon, authenticated;
