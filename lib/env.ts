// Centralized, fail-loud access to environment variables.
// Public (NEXT_PUBLIC_*) values are validated at boot. Secret/server-only
// values are validated lazily at first read so builds in environments
// that don't have every secret available (e.g. local web-only work)
// don't crash.

import { z } from 'zod';

// An optional secret that is present but unusable — empty, whitespace, or too
// short — is treated as absent instead of fatal.
//
// `serverEnv()` validates every variable at once, so a single junk optional
// value used to throw on EVERY server action that reads it. That is exactly how
// a stray LIFECYCLE_EMAIL_UNSUB_SECRET took down the onboarding wizard: the
// group, establishment and roles were already written, then minting the
// onboarding token read serverEnv() and blew up, leaving the manager on a dead
// "Une erreur est survenue" screen with no way forward.
//
// Every variable below is optional precisely because the feature it gates
// degrades cleanly without it, so dropping a broken value (loudly, in the logs)
// is strictly better than taking the app down with it. Required variables keep
// failing at the first read, as they should.
function optionalSecret(name: string, minLength: number) {
  return z.preprocess((raw) => {
    if (typeof raw !== 'string') return undefined;
    const value = raw.trim();
    if (value.length === 0) return undefined;
    if (value.length < minLength) {
      console.error(
        `[env] ${name} is set but shorter than ${minLength} characters — ignoring it. ` +
        'The feature it gates stays disabled; unset it or give it a real value.'
      );
      return undefined;
    }
    return value;
  }, z.string().min(minLength).optional());
}

const publicSchema = z.object({
  NEXT_PUBLIC_BASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(10),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: optionalSecret('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY', 10),
  // End date of the launch offer, as YYYY-MM-DD (interpreted as end of that
  // day, UTC). Drives the countdown in the landing promo banner. When unset or
  // already past, the banner falls back to its evergreen text and no deadline
  // is announced — an offer with no end date must not claim to have one.
  NEXT_PUBLIC_LAUNCH_OFFER_ENDS_AT: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD')
    .optional(),
});

const parsed = publicSchema.safeParse({
  NEXT_PUBLIC_BASE_URL: process.env.NEXT_PUBLIC_BASE_URL,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  NEXT_PUBLIC_LAUNCH_OFFER_ENDS_AT: process.env.NEXT_PUBLIC_LAUNCH_OFFER_ENDS_AT,
});

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  ${i.path.join('.')}: ${i.message}`)
    .join('\n');
  throw new Error(`Invalid environment variables:\n${issues}`);
}

export const publicEnv = parsed.data;

const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(10),
  STRIPE_SECRET_KEY: z.string().min(10),
  STRIPE_WEBHOOK_SECRET: z.string().min(10),
  // Cron + cold-email — required so /api/cron/* and /api/cold-email/unsubscribe
  // are never accidentally publicly callable. Must be distinct so a leak of one
  // does not allow forging the other.
  CRON_SECRET: z.string().min(16),
  COLD_EMAIL_UNSUB_SECRET: z.string().min(16),
  // Lifecycle-email unsubscribe link signing secret. Optional: when absent,
  // automated emails simply omit the one-click unsubscribe link.
  LIFECYCLE_EMAIL_UNSUB_SECRET: optionalSecret('LIFECYCLE_EMAIL_UNSUB_SECRET', 16),
  // Onboarding express token signing secret. Used by lib/auth/onboarding-token.
  ONBOARDING_TOKEN_SECRET: z.string().min(32),
  // Stripe Product IDs (prod_...). Validated whenever serverEnv() is read
  // (lazily). The pricing layer (lib/stripe/pricing.ts) reads these directly
  // and resolves each product's default_price, so changing the tariff in Stripe
  // propagates without an env change. Logs an error if missing.
  STRIPE_PRODUCT_PACK_SOLO: z.string().min(3),
  STRIPE_PRODUCT_PACK_DUO: z.string().min(3),
  // Digitip Pro recurring prices (price_...). Optional: without them the
  // subscribe route returns a clean 503 and the rest of the app keeps working
  // on the free plan, rather than refusing to boot.
  STRIPE_PRICE_PRO_MONTHLY: optionalSecret('STRIPE_PRICE_PRO_MONTHLY', 3),
  STRIPE_PRICE_PRO_YEARLY: optionalSecret('STRIPE_PRICE_PRO_YEARLY', 3),
  // Dev-only routes (seed-demo) gated by an explicit boolean rather than
  // NODE_ENV so a preview deployment with NODE_ENV=production can't be tricked
  // into exposing them.
  SEED_DEMO_ENABLED: z.enum(['true', 'false']).optional().default('false'),
  // Ambassador system (optional — ambassador routes degrade to 500 when absent)
  TELEGRAM_BOT_TOKEN: optionalSecret('TELEGRAM_BOT_TOKEN', 10),
  TELEGRAM_CHAT_ID: optionalSecret('TELEGRAM_CHAT_ID', 1),
  // If ambassadors are active, set this to a >=32-char random hex string:
  // node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  AMBASSADOR_SESSION_SECRET: optionalSecret('AMBASSADOR_SESSION_SECRET', 32),
  // Commercial (Commerciaux Pros) portal session secret. Optional: when absent
  // the commercial portal reuses AMBASSADOR_SESSION_SECRET (see
  // lib/auth/commercial-session.ts). The two portals' cookies are
  // domain-separated by an HMAC purpose tag, so sharing the secret is safe, but
  // setting a distinct value here fully isolates them.
  COMMERCIAL_SESSION_SECRET: optionalSecret('COMMERCIAL_SESSION_SECRET', 32),
  // Brevo (ex-Sendinblue) API key — used exclusively for the commercial cold
  // email funnel (B2B partner recruitment) to isolate sender reputation from
  // digitip.app transactional traffic. Optional — when missing, the commercial
  // cold-email cron skips sends with a logged warning.
  BREVO_API_KEY: optionalSecret('BREVO_API_KEY', 10),
});

let serverCache: z.infer<typeof serverSchema> | null = null;
export function serverEnv() {
  if (serverCache) return serverCache;
  const res = serverSchema.safeParse({
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
    CRON_SECRET: process.env.CRON_SECRET,
    COLD_EMAIL_UNSUB_SECRET: process.env.COLD_EMAIL_UNSUB_SECRET,
    LIFECYCLE_EMAIL_UNSUB_SECRET: process.env.LIFECYCLE_EMAIL_UNSUB_SECRET,
    ONBOARDING_TOKEN_SECRET: process.env.ONBOARDING_TOKEN_SECRET,
    STRIPE_PRODUCT_PACK_SOLO: process.env.STRIPE_PRODUCT_PACK_SOLO,
    STRIPE_PRODUCT_PACK_DUO: process.env.STRIPE_PRODUCT_PACK_DUO,
    STRIPE_PRICE_PRO_MONTHLY: process.env.STRIPE_PRICE_PRO_MONTHLY,
    STRIPE_PRICE_PRO_YEARLY: process.env.STRIPE_PRICE_PRO_YEARLY,
    SEED_DEMO_ENABLED: process.env.SEED_DEMO_ENABLED,
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
    TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID,
    AMBASSADOR_SESSION_SECRET: process.env.AMBASSADOR_SESSION_SECRET,
    COMMERCIAL_SESSION_SECRET: process.env.COMMERCIAL_SESSION_SECRET,
    BREVO_API_KEY: process.env.BREVO_API_KEY,
  });
  if (!res.success) {
    const issues = res.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid server environment variables:\n${issues}`);
  }
  serverCache = res.data;
  return serverCache;
}

export function getBaseUrl(): string {
  return publicEnv.NEXT_PUBLIC_BASE_URL.replace(/\/$/, '');
}

export type PackId = 'solo' | 'duo';

export type PackDefinition = {
  id: PackId;
  quantity: number;
  hardwareAmount: number; // cents, excl. VAT, one-time
  listAmount: number;     // cents — pre-launch "regular" price, shown struck through
  currency: 'eur';
};

// Canonical product catalog. Hardware is billed once; revenue is then
// earned via per-transaction commission (see groups.platform_fee_bps).
// Keep amounts in sync with the Stripe Products/Prices in the dashboard.
// `listAmount` is the fallback strikethrough price when a Stripe product has
// no `list_price_cents` metadata.
export const PACKS: Record<PackId, PackDefinition> = {
  solo: { id: 'solo', quantity: 1, hardwareAmount: 6900, listAmount: 9900,  currency: 'eur' },
  duo:  { id: 'duo',  quantity: 2, hardwareAmount: 9900, listAmount: 13900, currency: 'eur' },
};

// Default platform commission applied to every tip, in basis points.
// Mirrors the server-side default (groups.platform_fee_bps DEFAULT 500).
export const DEFAULT_PLATFORM_FEE_BPS = 500;
