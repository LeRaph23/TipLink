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
  process.env.STRIPE_PRICE_PACK_SOLO_HARDWARE = 'price_solo';
  process.env.STRIPE_PRICE_PACK_DUO_HARDWARE = 'price_duo';
});

describe('signOnboardingToken / verifyOnboardingToken', () => {
  it('round-trips a valid token', async () => {
    const { signOnboardingToken, verifyOnboardingToken } = await import('@/lib/auth/onboarding-token');
    const groupId = '11111111-2222-3333-4444-555555555555';
    const email = 'salon@example.com';
    const token = signOnboardingToken(groupId, email);

    const verified = verifyOnboardingToken(token, groupId);
    expect(verified.valid).toBe(true);
    if (verified.valid) {
      expect(verified.email).toBe(email);
      expect(verified.exp).toBeGreaterThan(Date.now());
    }
  });

  it('rejects a token with mismatched groupId', async () => {
    const { signOnboardingToken, verifyOnboardingToken } = await import('@/lib/auth/onboarding-token');
    const token = signOnboardingToken('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a@b.c');
    const verified = verifyOnboardingToken(token, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
    expect(verified.valid).toBe(false);
    if (!verified.valid) expect(verified.reason).toBe('group_mismatch');
  });

  it('rejects an expired token', async () => {
    const { signOnboardingToken, verifyOnboardingToken } = await import('@/lib/auth/onboarding-token');
    const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000;
    const token = signOnboardingToken('cccccccc-cccc-cccc-cccc-cccccccccccc', 'x@y.z', eightDaysAgo);
    const verified = verifyOnboardingToken(token, 'cccccccc-cccc-cccc-cccc-cccccccccccc');
    expect(verified.valid).toBe(false);
    if (!verified.valid) expect(verified.reason).toBe('expired');
  });

  it('rejects a tampered signature', async () => {
    const { signOnboardingToken, verifyOnboardingToken } = await import('@/lib/auth/onboarding-token');
    const groupId = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
    const token = signOnboardingToken(groupId, 'h@i.j');
    const tampered = token.slice(0, -2) + 'xx';
    const verified = verifyOnboardingToken(tampered, groupId);
    expect(verified.valid).toBe(false);
    if (!verified.valid) expect(verified.reason).toBe('bad_signature');
  });

  it('rejects malformed input', async () => {
    const { verifyOnboardingToken } = await import('@/lib/auth/onboarding-token');
    expect(verifyOnboardingToken('', 'x').valid).toBe(false);
    expect(verifyOnboardingToken('no-dot-here', 'x').valid).toBe(false);
    expect(verifyOnboardingToken(null, 'x').valid).toBe(false);
    expect(verifyOnboardingToken(undefined, 'x').valid).toBe(false);
  });
});
