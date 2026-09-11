import { serverEnv } from '@/lib/env';
import { b64url, fromB64url, hmac, timingSafeEqualString } from '@/lib/auth/hmac-token';

/**
 * Signed "join my team" links.
 *
 * A manager can hand out one QR code instead of inviting every employee by
 * email, which is how the flow was used before any of this was checked. The
 * token replaces the thing that used to stand in for authorisation there:
 * nothing at all. POST /api/staff/join accepted whatever establishment id the
 * request body carried, and that id is public (it is the href of the "see the
 * team" link on the page every NFC scan lands on).
 *
 * Three properties matter, and each is enforced below rather than assumed:
 *
 *  - it names one establishment, so a token for salon A is refused for salon B;
 *  - it expires, so a QR photographed off a break-room wall does not work for
 *    ever;
 *  - it is revocable, via `establishments.team_join_version` (migration 00079).
 *    The version is signed in and re-checked against the row on use, so a
 *    manager who rotates the link breaks every copy of the old one. A pure
 *    HMAC over (establishment, expiry) could not offer that: once minted it
 *    would be valid until expiry no matter what.
 */

/** 30 days. Long enough for a printed QR, short enough that a leak ages out. */
const TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Domain-separation tag mixed into the HMAC.
 *
 * This scheme shares ONBOARDING_TOKEN_SECRET with lib/auth/onboarding-token,
 * which signs over a bare payload. Signing over `team:<payload>` here makes the
 * two disjoint: an onboarding token (which grants group_admin) can never be
 * replayed as a team-join token, nor the reverse, even though one secret backs
 * both. Same reasoning as the `com:` tag in lib/auth/commercial-session.ts.
 *
 * Reusing the secret is deliberate. A new required environment variable is a
 * new way for a deploy to fail closed in production, which is exactly the
 * failure mode lib/env-requirements.ts exists to prevent.
 */
const TEAM_PURPOSE = 'team';

function sign(payload: string, secret: string): string {
  return hmac(`${TEAM_PURPOSE}:${payload}`, secret);
}

export type TeamJoinVerifyResult =
  | { valid: true; establishmentId: string; version: number; exp: number }
  | {
      valid: false;
      reason: 'malformed' | 'bad_signature' | 'expired' | 'establishment_mismatch' | 'revoked';
    };

/**
 * Mints a token for `establishmentId` at the establishment's current
 * `team_join_version`. Callers read that version from the row; passing a stale
 * one produces a token that verifies as `revoked`.
 */
export function signTeamJoinToken(
  establishmentId: string,
  version: number,
  now: number = Date.now(),
): string {
  const secret = serverEnv().ONBOARDING_TOKEN_SECRET;
  const exp = now + TTL_MS;
  const payload = b64url(Buffer.from(`${establishmentId}|${version}|${exp}`, 'utf8'));
  return `${payload}.${sign(payload, secret)}`;
}

/**
 * Verifies a token against the establishment it claims and that
 * establishment's current version.
 *
 * The signature is checked before anything is decoded, so a forged payload is
 * never parsed. Every rejection is a distinct reason, for the caller's logs
 * only: the routes answer with one generic error regardless, so that a caller
 * probing ids cannot tell "wrong establishment" from "revoked".
 */
export function verifyTeamJoinToken(
  token: string | null | undefined,
  expectedEstablishmentId: string,
  expectedVersion: number,
  now: number = Date.now(),
): TeamJoinVerifyResult {
  if (!token || typeof token !== 'string' || !token.includes('.')) {
    return { valid: false, reason: 'malformed' };
  }
  const lastDot = token.lastIndexOf('.');
  const payload = token.slice(0, lastDot);
  const sig = token.slice(lastDot + 1);
  if (!payload || !sig) return { valid: false, reason: 'malformed' };

  const secret = serverEnv().ONBOARDING_TOKEN_SECRET;
  if (!timingSafeEqualString(sig, sign(payload, secret))) {
    return { valid: false, reason: 'bad_signature' };
  }

  let decoded: string;
  try {
    decoded = fromB64url(payload).toString('utf8');
  } catch {
    return { valid: false, reason: 'malformed' };
  }

  const parts = decoded.split('|');
  if (parts.length !== 3) return { valid: false, reason: 'malformed' };
  const [establishmentId, versionStr, expStr] = parts;

  const exp = Number(expStr);
  const version = Number(versionStr);
  if (!Number.isFinite(exp) || !Number.isInteger(version)) {
    return { valid: false, reason: 'malformed' };
  }

  if (establishmentId !== expectedEstablishmentId) {
    return { valid: false, reason: 'establishment_mismatch' };
  }
  if (now >= exp) return { valid: false, reason: 'expired' };
  // Rotating the establishment's version is what revokes outstanding links.
  if (version !== expectedVersion) return { valid: false, reason: 'revoked' };

  return { valid: true, establishmentId, version, exp };
}
