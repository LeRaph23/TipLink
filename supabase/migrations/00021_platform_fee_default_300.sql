-- Default platform commission: 3% (300 bps), aligned with product copy.
ALTER TABLE public.groups
  ALTER COLUMN platform_fee_bps SET DEFAULT 300;

COMMENT ON COLUMN public.groups.platform_fee_bps IS
  'Platform commission on each tip, in basis points (300 = 3%). Applied via Stripe application_fee_amount.';
