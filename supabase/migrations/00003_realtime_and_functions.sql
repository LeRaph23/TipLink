-- ============================================================
-- REALTIME PUBLICATION
-- Enable realtime only for tables that need live dashboard updates.
-- RLS is automatically applied to realtime subscriptions.
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE transactions;
ALTER PUBLICATION supabase_realtime ADD TABLE staff_profiles;

-- ============================================================
-- FISCAL EXPORT FUNCTION
-- Returns consolidated transaction totals per establishment
-- for social/fiscal declarations.
-- ============================================================
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
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT
    sp.id AS staff_id,
    sp.full_name,
    SUM(t.amount) AS total_tips,
    COUNT(t.id) AS transaction_count,
    t.currency
  FROM transactions t
  JOIN staff_profiles sp ON sp.id = t.staff_id
  WHERE t.establishment_id = p_establishment_id
    AND t.status = 'succeeded'
    AND t.created_at >= p_from
    AND t.created_at < p_to
  GROUP BY sp.id, sp.full_name, t.currency
  ORDER BY total_tips DESC;
$$;
