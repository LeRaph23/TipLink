-- ============================================================
-- Secure get_establishment_report
-- The original version in 00003 was SECURITY DEFINER without
-- any auth check, so any role with EXECUTE privilege could read
-- aggregated tip totals for any establishment (cross-tenant leak).
--
-- We:
--   1. REVOKE EXECUTE from anon, authenticated (PUBLIC fallback).
--   2. Rewrite the function to verify the caller is super_admin,
--      group admin of the establishment's group, or manager of it.
--   3. GRANT EXECUTE only to authenticated.
-- ============================================================

REVOKE EXECUTE ON FUNCTION get_establishment_report(UUID, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION get_establishment_report(UUID, TIMESTAMPTZ, TIMESTAMPTZ) FROM anon;
REVOKE EXECUTE ON FUNCTION get_establishment_report(UUID, TIMESTAMPTZ, TIMESTAMPTZ) FROM authenticated;

CREATE OR REPLACE FUNCTION get_establishment_report(
  p_establishment_id UUID,
  p_from TIMESTAMPTZ,
  p_to TIMESTAMPTZ
)
RETURNS TABLE (
  staff_id UUID,
  full_name TEXT,
  total_tips BIGINT,
  transaction_count BIGINT,
  currency TEXT
)
LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
DECLARE
  v_group_id UUID;
  v_allowed BOOLEAN;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'auth required' USING ERRCODE = '42501';
  END IF;

  SELECT e.group_id INTO v_group_id
  FROM establishments e
  WHERE e.id = p_establishment_id AND e.deleted_at IS NULL;

  IF v_group_id IS NULL THEN
    RAISE EXCEPTION 'establishment not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT
    is_super_admin()
    OR v_group_id = ANY(get_my_group_ids())
    OR p_establishment_id = ANY(get_my_managed_establishment_ids())
  INTO v_allowed;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    sp.id AS staff_id,
    sp.full_name,
    SUM(t.amount)::BIGINT AS total_tips,
    COUNT(t.id)::BIGINT AS transaction_count,
    t.currency
  FROM transactions t
  JOIN staff_profiles sp ON sp.id = t.staff_id
  WHERE t.establishment_id = p_establishment_id
    AND t.status = 'succeeded'
    AND t.created_at >= p_from
    AND t.created_at < p_to
  GROUP BY sp.id, sp.full_name, t.currency
  ORDER BY total_tips DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_establishment_report(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
