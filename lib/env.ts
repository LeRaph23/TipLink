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
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().min(10).optional(),
});

const parsed = publicSchema.safeParse({
  NEXT_PUBLIC_BASE_URL: process.env.NEXT_PUBLIC_BASE_URL,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
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
});

let serverCache: z.infer<typeof serverSchema> | null = null;
export function serverEnv() {
  if (serverCache) return serverCache;
  const res = serverSchema.safeParse({
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
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
  currency: 'eur';
};

// Canonical product catalog. Hardware is billed once; revenue is then
// earned via per-transaction commission (see groups.platform_fee_bps).
// Keep amounts in sync with the Stripe Products/Prices in the dashboard.
export const PACKS: Record<PackId, PackDefinition> = {
  solo: { id: 'solo', quantity: 1, hardwareAmount: 6900, currency: 'eur' },
  duo:  { id: 'duo',  quantity: 2, hardwareAmount: 9900, currency: 'eur' },
};

// Default platform commission applied to every tip, in basis points.
// Mirrors the server-side default (groups.platform_fee_bps DEFAULT 200).
export const DEFAULT_PLATFORM_FEE_BPS = 200;

type StripePackPrices = {
  hardware: string;
};

function req(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(`${name} is not set. Define it in your environment.`);
  }
  return v;
}

export function getPackPrices(pack: PackId): StripePackPrices {
  const suffix = pack.toUpperCase();
  return {
    hardware: req(`STRIPE_PRICE_PACK_${suffix}_HARDWARE`),
  };
}
