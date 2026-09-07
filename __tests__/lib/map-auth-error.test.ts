import { describe, it, expect } from 'vitest';
import { mapAuthError } from '@/lib/auth/map-auth-error';

// The translator is the identity function here: what matters is which key gets
// chosen, not how it reads. Supabase's wording is the input we do not control,
// so each branch is pinned against the strings it actually emits.
const t = (key: string) => key;

describe('mapAuthError', () => {
  it('reads every shape of a bad code as one message', () => {
    expect(mapAuthError('Token has expired or is invalid', t)).toBe('errorInvalidCode');
    expect(mapAuthError('otp_expired', t)).toBe('errorInvalidCode');
    expect(mapAuthError('Invalid token', t)).toBe('errorInvalidCode');
  });

  // shouldCreateUser: false on an unknown address. Supabase calls this signups
  // being disallowed, which is true of the call and meaningless to the reader.
  it('turns a refused signup into "no account here"', () => {
    expect(mapAuthError('Signups not allowed for otp', t)).toBe('errorNoAccount');
    expect(mapAuthError('User not found', t)).toBe('errorNoAccount');
  });

  it('still recognises a taken address, a rate limit and a dead network', () => {
    expect(mapAuthError('User already registered', t)).toBe('errorEmailInUse');
    expect(mapAuthError('email rate limit exceeded', t)).toBe('errorTooManyRequests');
    expect(mapAuthError('Failed to fetch', t)).toBe('errorNetwork');
  });

  // The whole point of the mapper: a message we have never seen must not reach
  // a user verbatim.
  it('never echoes an unrecognised message', () => {
    expect(mapAuthError('AuthApiError: 500 unexpected_failure', t)).toBe('errorGeneric');
    expect(mapAuthError('', t)).toBe('errorGeneric');
  });

  // A bad code is checked before a taken address on purpose: verifying an OTP
  // for an address that already exists is the normal path, not an error.
  it('prefers the code branch when both could match', () => {
    expect(mapAuthError('Token has expired or is invalid for this user already', t))
      .toBe('errorInvalidCode');
  });
});
