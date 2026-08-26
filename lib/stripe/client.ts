import Stripe from 'stripe';

// Stripe v22: must use `new Stripe(key)`, API version 2026-03-25.dahlia
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-03-25.dahlia',
  typescript: true,
});

// Business profile applied to every connected account.
//
// `url` is deliberately NOT set here. Stripe wants the *connected account's*
// own online presence — the salon's website, or its Facebook/Instagram page —
// because that field is what its risk review checks the business against.
// Filling it with the platform's own address gave every account the same URL,
// which is exactly the shape a shell network has; Stripe kept asking for a real
// one anyway, so it bought nothing and cost credibility.
//
// The accepted substitute for an account with no online presence is a
// product_description saying what is sold and when the customer is charged —
// hence the wording below, which answers both halves of Stripe's own prompt.
//
// `support_url` and `support_phone` stay on Digitip: we genuinely are the
// support channel for these accounts, so they are ours to give.
export const CONNECT_BUSINESS_PROFILE = {
  mcc: '7299', // Miscellaneous Personal Services — service workers receiving tips
  product_description:
    'Pourboires laissés volontairement par les clients de l\'établissement, débités au moment du paiement, en une seule fois.',
  support_phone: '+33770454382',
  support_url: 'https://digitip.app',
} as const;

// Shown on the customer's bank statement. The platform is the merchant of
// record for tips, so the connected account never charges customers directly —
// prefilling Digitip's descriptor just removes the confusing "public
// information" step from the recipient's onboarding. 5–22 chars.
export const CONNECT_STATEMENT_DESCRIPTOR = 'Digitip';
