-- Promo codes table — managed by super admin, applied at Stripe checkout
CREATE TABLE IF NOT EXISTS public.promo_codes (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  code                  text        NOT NULL UNIQUE,
  stripe_coupon_id      text        NOT NULL,
  stripe_promo_code_id  text        NOT NULL UNIQUE,
  percentage_off        integer     NOT NULL CHECK (percentage_off > 0 AND percentage_off <= 100),
  max_redemptions       integer,
  times_redeemed        integer     NOT NULL DEFAULT 0,
  expires_at            timestamptz,
  is_active             boolean     NOT NULL DEFAULT true,
  created_by            uuid        REFERENCES auth.users(id),
  created_at            timestamptz NOT NULL DEFAULT now()
);

-- Only super admins can manage promo codes
ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "promo_codes_super_admin_all" ON public.promo_codes
  FOR ALL TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- Add promo tracking columns to smarttag_orders
ALTER TABLE public.smarttag_orders
  ADD COLUMN IF NOT EXISTS promo_code         text,
  ADD COLUMN IF NOT EXISTS promo_code_id      uuid REFERENCES public.promo_codes(id),
  ADD COLUMN IF NOT EXISTS discount_amount    integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stripe_discount_id text;

-- Index for looking up orders by promo code
CREATE INDEX IF NOT EXISTS idx_smarttag_orders_promo_code_id
  ON public.smarttag_orders (promo_code_id)
  WHERE promo_code_id IS NOT NULL;

-- Helper RPC to atomically increment times_redeemed (called from webhook, service role only)
CREATE OR REPLACE FUNCTION public.increment_promo_redeemed(promo_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE promo_codes SET times_redeemed = times_redeemed + 1 WHERE id = promo_id;
$$;
