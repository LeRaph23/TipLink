// The server-side environment variables the app cannot boot without.
//
// This file is deliberately side-effect free: `lib/env.ts` validates the public
// variables at import time and throws when one is missing, which is exactly the
// situation `scripts/check-env.ts` exists to diagnose. A pre-deploy check that
// crashes instead of printing its checklist is worse than no check at all, so
// the list lives here and both sides read it.
//
// `serverSchema` in lib/env.ts and this list are kept in step by
// __tests__/lib/env-required-parity.test.ts. That test is the point of the
// file: the two lists used to be maintained by hand, and check-env.ts had
// drifted three variables behind, happily printing "Ready to deploy" for a
// configuration that throws on the first server action that reads serverEnv().

export type RequiredServerVar = {
  key: string;
  /** Mirrors the `z.string().min(...)` floor in lib/env.ts's serverSchema. */
  minLength: number;
  hint: string;
};

export const REQUIRED_SERVER_VARS: readonly RequiredServerVar[] = [
  { key: 'SUPABASE_SERVICE_ROLE_KEY', minLength: 10, hint: 'Supabase service role key (server-only)' },
  { key: 'STRIPE_SECRET_KEY',         minLength: 10, hint: 'Stripe secret key (sk_...)' },
  { key: 'STRIPE_WEBHOOK_SECRET',     minLength: 10, hint: 'Stripe webhook secret (whsec_...)' },
  { key: 'CRON_SECRET',               minLength: 16, hint: 'Bearer token for /api/cron/* — without it every cron route is public' },
  { key: 'COLD_EMAIL_UNSUB_SECRET',   minLength: 16, hint: 'Signs cold-email unsubscribe links. Must differ from CRON_SECRET' },
  { key: 'ONBOARDING_TOKEN_SECRET',   minLength: 32, hint: 'Signs onboarding + team-join tokens. 32+ chars: openssl rand -hex 32' },
  { key: 'STRIPE_PRODUCT_PACK_SOLO',  minLength: 3,  hint: 'Run: npm run setup:stripe' },
  { key: 'STRIPE_PRODUCT_PACK_DUO',   minLength: 3,  hint: 'Run: npm run setup:stripe' },
];

/** Public (NEXT_PUBLIC_*) variables validated at boot by lib/env.ts. */
export const REQUIRED_PUBLIC_VARS: readonly RequiredServerVar[] = [
  { key: 'NEXT_PUBLIC_BASE_URL',           minLength: 1,  hint: 'e.g. https://digitip.app' },
  { key: 'NEXT_PUBLIC_SUPABASE_URL',       minLength: 1,  hint: 'Supabase project URL' },
  { key: 'NEXT_PUBLIC_SUPABASE_ANON_KEY',  minLength: 10, hint: 'Supabase anon key' },
];
