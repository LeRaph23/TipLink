import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// lifecycle_email_log has a partial unique index on dedup_key WHERE status IN
// ('pending','sent'). The engine writes a `pending` row, calls the transport,
// then marks the row `sent` on success or `failed` on throw.
//
// lifecycleSend used to return { id: null } instead of throwing when
// RESEND_API_KEY was unset, so the engine recorded a send that never happened —
// and that row then blocked the same email to the same recipient permanently,
// including after the key was configured. `failed` rows sit outside the index,
// so throwing keeps the send retryable.

describe('lifecycle email transport guard', () => {
  const originalKey = process.env.RESEND_API_KEY;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    if (originalKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = originalKey;
    vi.resetModules();
  });

  it('throws rather than reporting a phantom send when the API key is missing', async () => {
    delete process.env.RESEND_API_KEY;
    const mod = await import('@/lib/email');

    // Any lifecycle sender routes through lifecycleSend.
    await expect(
      mod.sendGroupOnboardingNudge({
        to: 'admin@example.com',
        firstName: 'Alice',
        setupUrl: 'https://digitip.app/fr/onboarding',
        step: 1,
      })
    ).rejects.toThrow(/RESEND_API_KEY/);
  });

  it('names the variable in the error so the cause is obvious in logs', async () => {
    delete process.env.RESEND_API_KEY;
    const mod = await import('@/lib/email');
    await expect(
      mod.sendGroupOnboardingNudge({
        to: 'admin@example.com',
        firstName: 'Alice',
        setupUrl: 'https://digitip.app/fr/onboarding',
        step: 1,
      })
    ).rejects.toThrow(/not configured/);
  });
});
