-- 00016: Switch business model to hardware one-shot + per-transaction commission.
-- Adds a configurable platform fee (in basis points) per group.
-- Subscription-era columns (subscription_status, subscription_id, subscription_pack)
-- are kept nullable for historical data but stop being used by the app.

ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS platform_fee_bps INTEGER NOT NULL DEFAULT 200;

COMMENT ON COLUMN public.groups.platform_fee_bps IS
  'Platform commission on each tip, in basis points (200 = 2%). Applied via Stripe application_fee_amount.';

-- Sanity bounds: between 0% and 15%.
ALTER TABLE public.groups
  DROP CONSTRAINT IF EXISTS groups_platform_fee_bps_range;
ALTER TABLE public.groups
  ADD CONSTRAINT groups_platform_fee_bps_range
  CHECK (platform_fee_bps >= 0 AND platform_fee_bps <= 1500);

-- Reload PostgREST schema cache.
NOTIFY pgrst, 'reload schema';
