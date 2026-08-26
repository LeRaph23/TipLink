import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// `serverEnv()` memoizes its result and `lib/env` validates the public schema at
// import time, so every case re-imports the module with its own process.env.
async function readServerEnv() {
  vi.resetModules();
  const { serverEnv } = await import('@/lib/env');
  return serverEnv();
}

describe('serverEnv optional secrets', () => {
  const original = { ...process.env };

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = { ...original };
    vi.restoreAllMocks();
  });

  // The regression this guards: a LIFECYCLE_EMAIL_UNSUB_SECRET too short to
  // pass validation made serverEnv() throw for every caller, which killed the
  // onboarding wizard on its last step — after the group and establishment had
  // already been written.
  it('ignores an optional secret that is too short instead of throwing', async () => {
    process.env.LIFECYCLE_EMAIL_UNSUB_SECRET = 'short';

    const env = await readServerEnv();

    expect(env.LIFECYCLE_EMAIL_UNSUB_SECRET).toBeUndefined();
    expect(env.ONBOARDING_TOKEN_SECRET).toBeTruthy();
    expect(console.error).toHaveBeenCalled();
  });

  it('treats an empty or whitespace-only optional secret as absent', async () => {
    process.env.LIFECYCLE_EMAIL_UNSUB_SECRET = '';
    process.env.BREVO_API_KEY = '   ';

    const env = await readServerEnv();

    expect(env.LIFECYCLE_EMAIL_UNSUB_SECRET).toBeUndefined();
    expect(env.BREVO_API_KEY).toBeUndefined();
  });

  it('keeps a usable optional secret, trimmed', async () => {
    process.env.LIFECYCLE_EMAIL_UNSUB_SECRET = '  lifecycle-secret-of-at-least-16-chars  ';

    const env = await readServerEnv();

    expect(env.LIFECYCLE_EMAIL_UNSUB_SECRET).toBe('lifecycle-secret-of-at-least-16-chars');
  });

  it('still fails loudly on a required secret', async () => {
    delete process.env.ONBOARDING_TOKEN_SECRET;

    await expect(readServerEnv()).rejects.toThrow(/ONBOARDING_TOKEN_SECRET/);
  });
});
