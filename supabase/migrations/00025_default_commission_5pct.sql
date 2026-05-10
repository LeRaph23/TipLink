-- 00025: Change default platform commission from 2% to 5% (500 bps).
-- Aligns the database default with the app-level constant (DEFAULT_PLATFORM_FEE_BPS = 500)
-- and the API fallback (create-intent, create-group-intent).
-- Also backfills existing groups that still have the old 200-bps default.

ALTER TABLE public.groups
  ALTER COLUMN platform_fee_bps SET DEFAULT 500;

COMMENT ON COLUMN public.groups.platform_fee_bps IS
  'Platform commission on each tip, in basis points (500 = 5%). Applied via Stripe application_fee_amount.';

-- Backfill groups that were created with the old 2% default and haven't been
-- explicitly changed by an admin (i.e., still at exactly 200 bps).
UPDATE public.groups
  SET platform_fee_bps = 500
  WHERE platform_fee_bps = 200
    AND deleted_at IS NULL;

NOTIFY pgrst, 'reload schema';
