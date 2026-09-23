import crypto from 'node:crypto';

/**
 * Encoding and comparison primitives shared by the signed-token schemes
 * (lib/auth/onboarding-token.ts, lib/auth/team-join-token.ts).
 *
 * Kept in one place deliberately: these are the parts where a small mistake is
 * silent rather than loud. Base64url padding that is one character off, or a
 * `===` where a constant-time compare belongs, produces a token scheme that
 * still round-trips in tests and still rejects obvious garbage, while being
 * weaker than it reads.
 */

export function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromB64url(s: string): Buffer {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  return Buffer.from(padded, 'base64');
}

/** Base64url-encoded HMAC-SHA256 of `payload` under `secret`. */
export function hmac(payload: string, secret: string): string {
  return b64url(crypto.createHmac('sha256', secret).update(payload).digest());
}

/**
 * Constant-time string comparison.
 *
 * `timingSafeEqual` throws when the two buffers differ in length, so the length
 * check has to come first. That leaks the length of the expected signature,
 * which is a fixed 43 characters for every base64url SHA-256 digest here and
 * therefore not a secret.
 */
export function timingSafeEqualString(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}
