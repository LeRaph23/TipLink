-- Manual bonus validation — no bonus ever reaches an ambassador automatically.
--
-- Base per-sale commission stays automatic (it is backed by a real, confirmed
-- pack sale and already collapses on refund). But every BONUS — weekly tier
-- bonuses and the monthly challenge — must be reviewed and released by a
-- super-admin from the dashboard.
--
-- We only persist what has been CREDITED: the "to review" list is derived
-- (bonuses earned from current sales) MINUS (rows in this table). Only credited
-- rows count toward an ambassador's withdrawable balance.

CREATE TABLE IF NOT EXISTS public.ambassador_bonus_credits (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  ambassador_id uuid        NOT NULL REFERENCES public.ambassadors(id) ON DELETE CASCADE,
  kind          text        NOT NULL CHECK (kind IN ('weekly_tier', 'monthly_challenge')),
  -- weekly_tier      → Paris week-start date, 'YYYY-MM-DD'
  -- monthly_challenge → Paris calendar month,  'YYYY-MM'
  period_key    text        NOT NULL,
  amount_cents  integer     NOT NULL CHECK (amount_cents > 0),
  credited_at   timestamptz NOT NULL DEFAULT now(),
  -- One credit per (ambassador, bonus kind, period) — a bonus is paid once.
  CONSTRAINT ambassador_bonus_credits_unique UNIQUE (ambassador_id, kind, period_key)
);

CREATE INDEX IF NOT EXISTS idx_ambassador_bonus_credits_amb
  ON public.ambassador_bonus_credits(ambassador_id);

ALTER TABLE public.ambassador_bonus_credits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ambassador_bonus_credits_super_admin_all"
  ON public.ambassador_bonus_credits
  FOR ALL TO authenticated
  USING (is_super_admin()) WITH CHECK (is_super_admin());
