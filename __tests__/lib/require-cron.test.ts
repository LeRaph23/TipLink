import { describe, it, expect, beforeAll } from 'vitest';

beforeAll(() => {
  process.env.NEXT_PUBLIC_BASE_URL = 'http://localhost:3000';
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'eyJ-test-anon-key-1234567890';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'eyJ-test-service-role-1234567890';
  process.env.STRIPE_SECRET_KEY = 'sk_test_123456789';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_123456789';
  process.env.CRON_SECRET = 'cron-test-secret-1234567890';
  process.env.COLD_EMAIL_UNSUB_SECRET = 'cold-email-test-secret-1234567890';
  process.env.ONBOARDING_TOKEN_SECRET = 'onboarding-test-secret-must-be-at-least-32-chars-long';
  process.env.STRIPE_PRODUCT_PACK_SOLO = 'prod_solo';
  process.env.STRIPE_PRODUCT_PACK_DUO = 'prod_duo';
});

describe('isAuthorizedCronRequest', () => {
  it('accepts a request with the correct bearer token', async () => {
    const { isAuthorizedCronRequest } = await import('@/lib/auth/require-cron');
    const req = new Request('http://x/y', {
      headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
    });
    expect(isAuthorizedCronRequest(req)).toBe(true);
  });

  it('rejects a missing header', async () => {
    const { isAuthorizedCronRequest } = await import('@/lib/auth/require-cron');
    const req = new Request('http://x/y');
    expect(isAuthorizedCronRequest(req)).toBe(false);
  });

  it('rejects a wrong secret', async () => {
    const { isAuthorizedCronRequest } = await import('@/lib/auth/require-cron');
    const req = new Request('http://x/y', {
      headers: { Authorization: 'Bearer not-the-real-secret-1234567890' },
    });
    expect(isAuthorizedCronRequest(req)).toBe(false);
  });

  it('rejects bare token without "Bearer "', async () => {
    const { isAuthorizedCronRequest } = await import('@/lib/auth/require-cron');
    const req = new Request('http://x/y', {
      headers: { Authorization: process.env.CRON_SECRET! },
    });
    expect(isAuthorizedCronRequest(req)).toBe(false);
  });
});
