// Vitest setup — ensures every required environment variable is present
// before any module imports `lib/env.ts`. Tests can still override individual
// values via `beforeEach`/`beforeAll`.

const defaults: Record<string, string> = {
  NEXT_PUBLIC_BASE_URL: 'http://localhost:3000',
  NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:54321',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'eyJ-test-anon-key-1234567890',
  SUPABASE_SERVICE_ROLE_KEY: 'eyJ-test-service-role-1234567890',
  NEXT_PUBLIC_MANGOPAY_CLIENT_ID: 'tiplink-test',
  NEXT_PUBLIC_MANGOPAY_ENVIRONMENT: 'SANDBOX',
  MANGOPAY_CLIENT_ID: 'tiplink-test',
  MANGOPAY_API_KEY: 'mangopay-test-api-key-1234567890',
  MANGOPAY_BASE_URL: 'https://api.sandbox.mangopay.com',
  MANGOPAY_PLATFORM_USER_ID: 'user_test_platform',
  MANGOPAY_CENTRAL_WALLET_ID: 'wallet_test_central',
  MANGOPAY_WEBHOOK_ALLOWED_IPS: '127.0.0.1',
  CRON_SECRET: 'cron-test-secret-must-be-16-chars-or-more',
  COLD_EMAIL_UNSUB_SECRET: 'cold-email-test-secret-must-be-16-chars',
  ONBOARDING_TOKEN_SECRET: 'onboarding-test-secret-must-be-at-least-32-chars-long',
};

for (const [k, v] of Object.entries(defaults)) {
  if (!process.env[k]) process.env[k] = v;
}
