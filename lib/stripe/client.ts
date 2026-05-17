import Stripe from 'stripe';

// Stripe v22: must use `new Stripe(key)`, API version 2026-03-25.dahlia
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-03-25.dahlia',
  typescript: true,
});

// Business profile applied to every connected (Custom) account. Without `url`
// and `mcc`, Stripe lists "provide a business website" / "merchant type" as
// outstanding requirements and blocks payouts even though the account is
// otherwise complete.
export const CONNECT_BUSINESS_PROFILE = {
  url: 'https://digitip.app',
  mcc: '7299', // Miscellaneous Personal Services — service workers receiving tips
  product_description: 'Réception de pourboires de la part de clients',
} as const;
