import Stripe from 'stripe';

// Stripe v22: must use `new Stripe(key)`, API version 2026-03-25.dahlia
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-03-25.dahlia',
  typescript: true,
});
