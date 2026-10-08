-- ============================================================
-- A daily ceiling on Google Places calls, enforced by us
--
-- Google bills every Places request past a monthly free allowance, and
-- nothing on our side counted them: the onboarding search is public, and one
-- click in the terrain admin can match thousands of salons. Google Cloud
-- quotas are the first line (set in the console); this is the second, which
-- holds even if the console is misconfigured, and across every serverless
-- instance, because it counts in the database rather than in memory.
--
-- One row per day (Paris) and per kind of call. consume_google_budget adds
-- one call if it stays within the limit and says whether it did, atomically,
-- so two requests racing for the last unit cannot both get it.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.google_api_usage (
  day   date    NOT NULL,
  sku   text    NOT NULL,
  calls integer NOT NULL DEFAULT 0,
  PRIMARY KEY (day, sku)
);

COMMENT ON TABLE public.google_api_usage IS
  'Google Places calls per Paris day and per kind, counted by consume_google_budget (lib/google-budget.ts).';

-- Service role only: no policy.
ALTER TABLE public.google_api_usage ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.consume_google_budget(p_sku text, p_daily_limit integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  used integer;
BEGIN
  IF p_daily_limit < 1 THEN
    RETURN false;
  END IF;
  INSERT INTO google_api_usage AS u (day, sku, calls)
  VALUES ((now() AT TIME ZONE 'Europe/Paris')::date, p_sku, 1)
  ON CONFLICT (day, sku) DO UPDATE SET calls = u.calls + 1
  WHERE u.calls < p_daily_limit
  RETURNING calls INTO used;
  RETURN used IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_google_budget(text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_google_budget(text, integer) TO service_role;
