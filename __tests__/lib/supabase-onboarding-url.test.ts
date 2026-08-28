import { describe, it, expect } from 'vitest';
import { isOnboardingUrl } from '@/lib/supabase/client';

// This guard is what stops supabase-js from redeeming a SmartTag id as a PKCE
// authorization code. When it stops matching, nothing breaks visibly — the
// confirmation email simply never works again — so the paths are pinned here.
describe('isOnboardingUrl', () => {
  it('matches the wizard on every locale, with or without a query', () => {
    expect(isOnboardingUrl(new URL('https://digitip.app/fr/onboarding?code=FNChjbBz'))).toBe(true);
    expect(isOnboardingUrl(new URL('https://digitip.app/en/onboarding?tag=FNChjbBz'))).toBe(true);
    expect(isOnboardingUrl(new URL('https://digitip.app/fr/onboarding'))).toBe(true);
    expect(isOnboardingUrl(new URL('https://digitip.app/fr/onboarding/'))).toBe(true);
  });

  it('leaves the auth callback and everything else alone', () => {
    expect(isOnboardingUrl(new URL('https://digitip.app/auth/callback?code=abc'))).toBe(false);
    expect(isOnboardingUrl(new URL('https://digitip.app/fr/login'))).toBe(false);
    expect(isOnboardingUrl(new URL('https://digitip.app/fr/dashboard'))).toBe(false);
    expect(isOnboardingUrl(new URL('https://digitip.app/'))).toBe(false);
  });

  // The staff flow lives at /dashboard/onboarding and has no colliding
  // parameter, but suppressing detection there would be harmless anyway.
  it('matches the staff onboarding path too', () => {
    expect(isOnboardingUrl(new URL('https://digitip.app/fr/dashboard/onboarding'))).toBe(true);
  });
});
