-- When a Digitip Pro subscription is set to end.
--
-- Cancelling from the Stripe customer portal cancels at the end of the period
-- by default: the subscription stays trialing/active, only `cancel_at` (and
-- `cancel_at_period_end`) change. The app ignored that, so a manager who had
-- just cancelled was still told "à la fin de l'essai, l'abonnement démarre à
-- 19 € HT par mois". Found by the second end-to-end QA run.
ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS subscription_cancel_at timestamptz;

COMMENT ON COLUMN public.groups.subscription_cancel_at IS
  'When the Pro subscription is scheduled to end (Stripe cancel_at). NULL when it renews. Written by the customer.subscription.* webhook.';
