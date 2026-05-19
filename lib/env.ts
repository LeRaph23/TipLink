// Centralized, fail-loud access to environment variables.
// Public (NEXT_PUBLIC_*) values are validated at boot. Secret/server-only
// values are validated lazily at first read so builds in environments
// that don't have every secret available (e.g. local web-only work)
// don't crash.

import { z } from 'zod';

const publicSchema = z.object({
  NEXT_PUBLIC_BASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(10),
  // Mangopay ClientId — also used by the browser Checkout SDK to tokenize cards.
  NEXT_PUBLIC_MANGOPAY_CLIENT_ID: z.string().min(2).optional(),
  // Checkout SDK environment selector.
  NEXT_PUBLIC_MANGOPAY_ENVIRONMENT: z
    .enum(['SANDBOX', 'PRODUCTION'])
    .optional()
    .default('SANDBOX'),
});

const parsed = publicSchema.safeParse({
  NEXT_PUBLIC_BASE_URL: process.env.NEXT_PUBLIC_BASE_URL,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_MANGOPAY_CLIENT_ID: process.env.NEXT_PUBLIC_MANGOPAY_CLIENT_ID,
  NEXT_PUBLIC_MANGOPAY_ENVIRONMENT: process.env.NEXT_PUBLIC_MANGOPAY_ENVIRONMENT,
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
  // Mangopay API credentials (Dashboard > API keys).
  MANGOPAY_CLIENT_ID: z.string().min(2),
  MANGOPAY_API_KEY: z.string().min(10),
  // API host — sandbox by default; production is https://api.mangopay.com
  MANGOPAY_BASE_URL: z
    .string()
    .url()
    .optional()
    .default('https://api.sandbox.mangopay.com'),
  // Platform Legal User + central collection wallet. Created once by
  // `npm run setup:mangopay`; paste the printed IDs back into the env.
  MANGOPAY_PLATFORM_USER_ID: z.string().min(2),
  MANGOPAY_CENTRAL_WALLET_ID: z.string().min(2),
  // Comma-separated allowlist of IPs/CIDRs Mangopay sends webhooks ("Hooks")
  // from. Hooks are unsigned, so this allowlist is the only authentication.
  MANGOPAY_WEBHOOK_ALLOWED_IPS: z.string().min(3),
  // Cron + cold-email — required so /api/cron/* and /api/cold-email/unsubscribe
  // are never accidentally publicly callable. Must be distinct so a leak of one
  // does not allow forging the other.
  CRON_SECRET: z.string().min(16),
  COLD_EMAIL_UNSUB_SECRET: z.string().min(16),
  // Lifecycle-email unsubscribe link signing secret. Optional: when absent,
  // automated emails simply omit the one-click unsubscribe link.
  LIFECYCLE_EMAIL_UNSUB_SECRET: z.string().min(16).optional(),
  // Onboarding express token signing secret. Used by lib/auth/onboarding-token.
  ONBOARDING_TOKEN_SECRET: z.string().min(32),
  // Dev-only routes (seed-demo) gated by an explicit boolean rather than
  // NODE_ENV so a preview deployment with NODE_ENV=production can't be tricked
  // into exposing them.
  SEED_DEMO_ENABLED: z.enum(['true', 'false']).optional().default('false'),
  // Ambassador system (optional — ambassador routes degrade to 500 when absent)
  TELEGRAM_BOT_TOKEN: z.string().min(10).optional(),
  TELEGRAM_CHAT_ID: z.string().min(1).optional(),
  // If ambassadors are active, set this to a >=32-char random hex string:
  // node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  AMBASSADOR_SESSION_SECRET: z.string().min(32).optional(),
});

let serverCache: z.infer<typeof serverSchema> | null = null;
export function serverEnv() {
  if (serverCache) return serverCache;
  const res = serverSchema.safeParse({
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    MANGOPAY_CLIENT_ID: process.env.MANGOPAY_CLIENT_ID,
    MANGOPAY_API_KEY: process.env.MANGOPAY_API_KEY,
    MANGOPAY_BASE_URL: process.env.MANGOPAY_BASE_URL,
    MANGOPAY_PLATFORM_USER_ID: process.env.MANGOPAY_PLATFORM_USER_ID,
    MANGOPAY_CENTRAL_WALLET_ID: process.env.MANGOPAY_CENTRAL_WALLET_ID,
    MANGOPAY_WEBHOOK_ALLOWED_IPS: process.env.MANGOPAY_WEBHOOK_ALLOWED_IPS,
    CRON_SECRET: process.env.CRON_SECRET,
    COLD_EMAIL_UNSUB_SECRET: process.env.COLD_EMAIL_UNSUB_SECRET,
    LIFECYCLE_EMAIL_UNSUB_SECRET: process.env.LIFECYCLE_EMAIL_UNSUB_SECRET,
    ONBOARDING_TOKEN_SECRET: process.env.ONBOARDING_TOKEN_SECRET,
    SEED_DEMO_ENABLED: process.env.SEED_DEMO_ENABLED,
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
    TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID,
    AMBASSADOR_SESSION_SECRET: process.env.AMBASSADOR_SESSION_SECRET,
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

// Canonical product catalog and single source of truth for pack pricing.
// Mangopay provides no product/price catalog, so these amounts are authoritative
// (lib/mangopay/pricing.ts simply reads them). Hardware is billed once; revenue
// is then earned via per-transaction commission (see groups.platform_fee_bps).
// `listAmount` is the struck-through pre-launch "regular" price.
export const PACKS: Record<PackId, PackDefinition> = {
  solo: { id: 'solo', quantity: 1, hardwareAmount: 6900, listAmount: 9900,  currency: 'eur' },
  duo:  { id: 'duo',  quantity: 2, hardwareAmount: 9900, listAmount: 13900, currency: 'eur' },
};

// Default platform commission applied to every tip, in basis points.
// Mirrors the server-side default (groups.platform_fee_bps DEFAULT 500).
export const DEFAULT_PLATFORM_FEE_BPS = 500;
