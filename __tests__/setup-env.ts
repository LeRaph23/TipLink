// Vitest setup — ensures every required environment variable is present
// before any module imports `lib/env.ts`. Tests can still override individual
// values via `beforeEach`/`beforeAll`.

const defaults: Record<string, string> = {
  NEXT_PUBLIC_BASE_URL: 'http://localhost:3000',
  NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:54321',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'eyJ-test-anon-key-1234567890',
  SUPABASE_SERVICE_ROLE_KEY: 'eyJ-test-service-role-1234567890',
  STRIPE_SECRET_KEY: 'sk_test_unit_test_1234567890',
  STRIPE_WEBHOOK_SECRET: 'whsec_test_unit_test_1234567890',
  CRON_SECRET: 'cron-test-secret-must-be-16-chars-or-more',
  COLD_EMAIL_UNSUB_SECRET: 'cold-email-test-secret-must-be-16-chars',
  ONBOARDING_TOKEN_SECRET: 'onboarding-test-secret-must-be-at-least-32-chars-long',
  STRIPE_PRODUCT_PACK_SOLO: 'prod_solo_test',
  STRIPE_PRODUCT_PACK_DUO: 'prod_duo_test',
};

for (const [k, v] of Object.entries(defaults)) {
  if (!process.env[k]) process.env[k] = v;
}
