-- Embedded checkout flow for hardware packs creates a Stripe PaymentIntent
-- instead of a Checkout Session, so we track the PI id separately.
-- Legacy auth flow still uses stripe_checkout_session_id.

ALTER TABLE public.smarttag_orders
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text UNIQUE;

CREATE INDEX IF NOT EXISTS idx_smarttag_orders_payment_intent
  ON public.smarttag_orders (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;
