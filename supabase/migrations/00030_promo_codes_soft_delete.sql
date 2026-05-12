-- Add soft-delete and notes support to promo_codes
ALTER TABLE public.promo_codes
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS notes text;

CREATE INDEX IF NOT EXISTS idx_promo_codes_deleted_at
  ON public.promo_codes (deleted_at)
  WHERE deleted_at IS NOT NULL;
