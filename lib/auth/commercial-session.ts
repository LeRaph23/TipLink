import crypto from 'node:crypto';
import type { NextRequest } from 'next/server';

export const COMMERCIAL_COOKIE = 'com_session';

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
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

export function buildCommercialCookieValue(
  commercialId: string,
  code: string,
  secret: string,
): string {
  const payload = `${commercialId}:${code.toLowerCase()}`;
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

    const [commercialId, payloadCode] = payload.split(':');
    if (payloadCode?.toLowerCase() !== expectedCode.toLowerCase()) {
      return { valid: false, commercialId: null };
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
