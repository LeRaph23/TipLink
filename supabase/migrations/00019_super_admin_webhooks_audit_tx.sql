-- Super-admin: read webhook delivery log, append-only audit, accurate tx aggregates.

-- 1) webhook_events: replace blanket deny with super_admin SELECT only.
DROP POLICY IF EXISTS "webhook_events_deny_all" ON public.webhook_events;

CREATE POLICY "webhook_events_super_admin_select" ON public.webhook_events
  FOR SELECT TO authenticated
  USING (public.is_super_admin());

-- 2) admin_audit_log
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid NOT NULL,
  action text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created_at ON public.admin_audit_log (created_at DESC);

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_audit_log_select" ON public.admin_audit_log
  FOR SELECT TO authenticated
  USING (public.is_super_admin());

CREATE POLICY "admin_audit_log_insert" ON public.admin_audit_log
  FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin() AND actor_user_id = auth.uid());

-- 3) Aggregated transaction stats for admin UI (filters applied in SQL).
CREATE OR REPLACE FUNCTION public.admin_transactions_summary(
  p_status text DEFAULT NULL,
  p_group_id uuid DEFAULT NULL,
  p_establishment_id uuid DEFAULT NULL,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL
)
RETURNS TABLE(row_count bigint, succeeded_volume_cents bigint)
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
    count(*)::bigint,
    coalesce(
      sum(
        CASE WHEN t.status = 'succeeded'::transaction_status THEN t.amount::bigint ELSE 0 END
      ),
      0
    )::bigint
  FROM public.transactions t
  INNER JOIN public.establishments e
    ON e.id = t.establishment_id AND e.deleted_at IS NULL
  WHERE (p_status IS NULL OR t.status = p_status::transaction_status)
    AND (p_establishment_id IS NULL OR t.establishment_id = p_establishment_id)
    AND (p_group_id IS NULL OR e.group_id = p_group_id)
    AND (p_from IS NULL OR t.created_at >= p_from)
    AND (p_to IS NULL OR t.created_at <= p_to);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_transactions_summary(text, uuid, uuid, timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_transactions_summary(text, uuid, uuid, timestamptz, timestamptz) TO authenticated;
