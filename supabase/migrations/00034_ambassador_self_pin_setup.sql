-- Allow ambassadors to set their own PIN via a one-time setup token.
-- Super-admins no longer enter a PIN when creating an ambassador.

ALTER TABLE public.ambassadors
  ALTER COLUMN pin_hash DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS pin_setup_token       text,
  ADD COLUMN IF NOT EXISTS pin_setup_expires_at  timestamptz;

CREATE INDEX IF NOT EXISTS idx_ambassadors_pin_setup_token
  ON public.ambassadors(pin_setup_token)
  WHERE pin_setup_token IS NOT NULL;

-- ambassador_sales has no ON DELETE clause. Deleting an ambassador with sales
-- would lose financial history — `deleteAmbassador` in app code guards against
-- this. ambassador_payouts and the referral/email tables already CASCADE.
