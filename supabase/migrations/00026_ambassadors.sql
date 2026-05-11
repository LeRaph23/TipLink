-- Ambassador system: track student sales reps who sell SmartTag hardware
-- via personal promo codes and earn per-sale commissions + weekly tier bonuses.

-- ─── ambassadors ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ambassadors (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text        NOT NULL,
  promo_code_id     uuid        NOT NULL REFERENCES public.promo_codes(id),
  pin_hash          text        NOT NULL, -- scryptSync(pin, id, 64) hex
  is_active         boolean     NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ambassadors_promo_code_unique UNIQUE (promo_code_id)
);

-- ─── ambassador_sales ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ambassador_sales (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  ambassador_id       uuid        NOT NULL REFERENCES public.ambassadors(id),
  smarttag_order_id   uuid        NOT NULL REFERENCES public.smarttag_orders(id),
  pack                text        NOT NULL CHECK (pack IN ('solo', 'duo')),
  commission_amount   integer     NOT NULL, -- cents (2500 = 25€, 3500 = 35€)
  salon_name_partial  text,                 -- last 3 chars only, e.g. "***abc"
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ambassador_sales_ambassador_id
  ON public.ambassador_sales(ambassador_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ambassador_sales_created_at
  ON public.ambassador_sales(created_at DESC);

-- ─── ambassador_pin_attempts (brute-force protection) ─────────────────────────
CREATE TABLE IF NOT EXISTS public.ambassador_pin_attempts (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_hash       text        NOT NULL, -- SHA-256 of IP (no PII stored)
  code          text        NOT NULL,
  attempted_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pin_attempts_ip_code
  ON public.ambassador_pin_attempts(ip_hash, code, attempted_at DESC);

-- ─── RLS ──────────────────────────────────────────────────────────────────────
-- All ambassador data is accessed exclusively via the service-role client
-- in API routes. Authenticated users can only access via super_admin role.

ALTER TABLE public.ambassadors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ambassador_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ambassador_pin_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ambassadors_super_admin_all" ON public.ambassadors
  FOR ALL TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

CREATE POLICY "ambassador_sales_super_admin_all" ON public.ambassador_sales
  FOR ALL TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- pin_attempts accessed via service role only — deny all authenticated access
CREATE POLICY "ambassador_pin_attempts_deny" ON public.ambassador_pin_attempts
  FOR ALL TO authenticated
  USING (false);
