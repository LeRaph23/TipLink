import crypto from 'node:crypto';
import type { NextRequest } from 'next/server';

export const COMMERCIAL_COOKIE = 'com_session';

// Server-enforced, tamper-proof session lifetime (issuedAt is signed into the
// cookie payload). Mirrors the ambassador portal.
const MAX_SESSION_AGE_MS = 7 * 24 * 60 * 60 * 1000;

// Domain-separation tag mixed into the HMAC. The commercial and ambassador
// portals may share the same signing secret (see getCommercialSessionSecret),
// so without this prefix a valid ambassador cookie would produce a signature
// that also verifies on the commercial route. Signing over `com:<payload>`
// makes the two portals' cookies cryptographically disjoint regardless of
// whether the secrets are split. The visible cookie format is unchanged.
const COMMERCIAL_PURPOSE = 'com';

/**
 * Resolves the HMAC secret used to sign commercial portal session cookies.
 *
 * Falls back to `AMBASSADOR_SESSION_SECRET` when `COMMERCIAL_SESSION_SECRET`
 * isn't set — both portals reuse the same cookie-signing infrastructure, only
 * the cookie name (and therefore the route's authentication surface) differs.
 * Operators can split the secrets later by setting COMMERCIAL_SESSION_SECRET
 * without touching code.
 */
export function getCommercialSessionSecret(): string {
  const s =
    process.env.COMMERCIAL_SESSION_SECRET ??
    process.env.AMBASSADOR_SESSION_SECRET;
  if (!s) throw new Error('COMMERCIAL_SESSION_SECRET / AMBASSADOR_SESSION_SECRET not set');
  return s;
}

function signCookie(payload: string, secret: string): string {
  // Bind the signature to the commercial portal so an ambassador cookie (signed
  // over a bare payload) cannot be replayed here even under a shared secret.
  return crypto.createHmac('sha256', secret).update(`${COMMERCIAL_PURPOSE}:${payload}`).digest('hex');
}

export function buildCommercialCookieValue(
  commercialId: string,
  code: string,
  secret: string,
): string {
  // issuedAt is signed in, so it can't be forged to extend a stolen cookie.
  const payload = `${commercialId}:${code.toLowerCase()}:${Date.now()}`;
  const sig = signCookie(payload, secret);
  return `${payload}.${sig}`;
}

export function verifyCommercialCookieValue(
  cookieValue: string,
  expectedCode: string,
  secret: string,
): { valid: boolean; commercialId: string | null } {
  try {
    const lastDot = cookieValue.lastIndexOf('.');
    if (lastDot === -1) return { valid: false, commercialId: null };
    const payload = cookieValue.slice(0, lastDot);
    const sig = cookieValue.slice(lastDot + 1);

    const expectedSig = signCookie(payload, secret);
    const sigBuf = Buffer.from(sig, 'hex');
    const expectedBuf = Buffer.from(expectedSig, 'hex');
    if (sigBuf.length !== expectedBuf.length) return { valid: false, commercialId: null };
    if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return { valid: false, commercialId: null };

    const [commercialId, payloadCode, issuedAtRaw] = payload.split(':');
    if (payloadCode?.toLowerCase() !== expectedCode.toLowerCase()) {
      return { valid: false, commercialId: null };
    }
    // Tamper-proof expiry. Legacy 2-part cookies (no issuedAt) stay valid only
    // until they age out of the browser; new cookies are hard-expired here.
    if (issuedAtRaw !== undefined) {
      const issuedAt = Number(issuedAtRaw);
      if (!Number.isFinite(issuedAt) || Date.now() - issuedAt > MAX_SESSION_AGE_MS) {
        return { valid: false, commercialId: null };
      }
    }
    return { valid: true, commercialId: commercialId ?? null };
  } catch {
    return { valid: false, commercialId: null };
  }
}

/**
 * Returns the authenticated commercial id from the session cookie, or null.
 * Reused across every authenticated /api/commercial/[code]/* route.
 */
export function authenticateCommercialRequest(
  req: NextRequest,
  code: string,
): string | null {
  const cookieValue = req.cookies.get(COMMERCIAL_COOKIE)?.value;
  if (!cookieValue) return null;
  let secret: string;
  try { secret = getCommercialSessionSecret(); } catch { return null; }
  const { valid, commercialId } = verifyCommercialCookieValue(cookieValue, code, secret);
  return valid ? commercialId : null;
}
