-- Super-admin: aggregated KPIs for the Commerciaux Pros pilotage dashboard.
--
-- Replaces two unbounded full-table SELECTs in the admin page
-- (commercial_sales + commercial_payouts loaded in full, then summed in JS)
-- with a single server-side aggregation — same pattern as
-- admin_transactions_summary (migration 00019). Keeps the page O(1) on payload
-- as the sales/payouts tables grow.
CREATE OR REPLACE FUNCTION public.commercial_pilotage_summary()
RETURNS TABLE(
  sales_count       bigint,
  solo_count        bigint,
  duo_count         bigint,
  total_commissions bigint,
  commissions_30d   bigint,
  sales_30d_count   bigint,
  paid_total        bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    (SELECT count(*) FROM public.commercial_sales
       WHERE voided_at IS NULL)::bigint,
    (SELECT count(*) FROM public.commercial_sales
       WHERE voided_at IS NULL AND pack::text = 'solo')::bigint,
    (SELECT count(*) FROM public.commercial_sales
       WHERE voided_at IS NULL AND pack::text = 'duo')::bigint,
    (SELECT coalesce(sum(commission_amount), 0) FROM public.commercial_sales
       WHERE voided_at IS NULL)::bigint,
    (SELECT coalesce(sum(commission_amount), 0) FROM public.commercial_sales
       WHERE voided_at IS NULL AND created_at > now() - interval '30 days')::bigint,
    (SELECT count(*) FROM public.commercial_sales
       WHERE voided_at IS NULL AND created_at > now() - interval '30 days')::bigint,
    (SELECT coalesce(sum(amount_cents), 0) FROM public.commercial_payouts
       WHERE status = 'paid')::bigint;
END;
$$;

REVOKE ALL ON FUNCTION public.commercial_pilotage_summary() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.commercial_pilotage_summary() TO authenticated;

NOTIFY pgrst, 'reload schema';
