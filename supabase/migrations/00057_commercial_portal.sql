-- Commerciaux Pros — portal infrastructure.
-- Parallel to the ambassador-side tables introduced in 00026 / 00029.
-- Provides per-commercial PIN rate-limiting, a serialization guard against
-- concurrent payout requests, and the matching advisory-lock RPCs.

-- ─── commercial_pin_attempts ────────────────────────────────────────────────
-- Rate-limit table for the /api/commercial/[code]/auth login endpoint.
-- One row per failed attempt; cleared on success.
CREATE TABLE IF NOT EXISTS public.commercial_pin_attempts (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_hash      text        NOT NULL,
  code         text        NOT NULL,
  attempted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_commercial_pin_attempts_lookup
  ON public.commercial_pin_attempts(ip_hash, code, attempted_at DESC);

ALTER TABLE public.commercial_pin_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "commercial_pin_attempts_super_admin_all" ON public.commercial_pin_attempts
  FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());

-- ─── payout serialization ───────────────────────────────────────────────────
-- A commercial can have at most one pending payout at a time. The partial
-- unique index makes two concurrent POSTs collide on insert (the second one
-- gets a 23505 violation and we surface "demande déjà en cours").
CREATE UNIQUE INDEX IF NOT EXISTS uniq_commercial_payouts_pending
  ON public.commercial_payouts(commercial_id)
  WHERE status = 'pending';

-- Advisory-lock helpers: cheap per-commercial mutex that short-circuits a
-- concurrent payout request immediately instead of hitting the index.
-- Returns true if the lock was acquired, false otherwise.
-- The lock keyspace is derived from the UUID hashed into a bigint, with
-- a constant offset so commercial locks never collide with ambassador ones
-- (which use a similar pattern starting at a different namespace).
CREATE OR REPLACE FUNCTION public.try_advisory_lock_commercial_payout(
  p_commercial_id uuid
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  k bigint;
BEGIN
  -- Namespace 2 for commercial payouts (ambassadors use namespace 1).
  k := ('x' || substr(md5(p_commercial_id::text), 1, 15))::bit(60)::bigint;
  RETURN pg_try_advisory_lock(2, k);
END;
$$;

CREATE OR REPLACE FUNCTION public.release_advisory_lock_commercial_payout(
  p_commercial_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  k bigint;
BEGIN
  k := ('x' || substr(md5(p_commercial_id::text), 1, 15))::bit(60)::bigint;
  PERFORM pg_advisory_unlock(2, k);
END;
$$;
