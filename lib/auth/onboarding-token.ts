import crypto from 'node:crypto';
import { serverEnv } from '@/lib/env';

const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(s: string): Buffer {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  return Buffer.from(padded, 'base64');
}

function sign(payload: string, secret: string): string {
  return b64url(crypto.createHmac('sha256', secret).update(payload).digest());
}

export function signOnboardingToken(groupId: string, email: string, now: number = Date.now()): string {
  const secret = serverEnv().ONBOARDING_TOKEN_SECRET;
  const exp = now + TTL_MS;
  const payload = b64url(Buffer.from(`${groupId}|${email}|${exp}`, 'utf8'));
  const sig = sign(payload, secret);
  return `${payload}.${sig}`;
}

export type VerifyResult =
  | { valid: true; email: string; exp: number }
  | { valid: false; reason: 'malformed' | 'bad_signature' | 'expired' | 'group_mismatch' };

export function verifyOnboardingToken(
  token: string | null | undefined,
  expectedGroupId: string,
  now: number = Date.now()
): VerifyResult {
  if (!token || typeof token !== 'string' || !token.includes('.')) {
    return { valid: false, reason: 'malformed' };
  }
  const [payload, sig] = token.split('.', 2);
  if (!payload || !sig) return { valid: false, reason: 'malformed' };

  const secret = serverEnv().ONBOARDING_TOKEN_SECRET;
  const expectedSig = sign(payload, secret);

  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
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
  const [groupId, email, expStr] = parts;
  const exp = Number(expStr);
  if (!Number.isFinite(exp)) return { valid: false, reason: 'malformed' };

  if (groupId !== expectedGroupId) return { valid: false, reason: 'group_mismatch' };
  if (now >= exp) return { valid: false, reason: 'expired' };

  return { valid: true, email, exp };
}
