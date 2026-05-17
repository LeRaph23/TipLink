import crypto from 'node:crypto';
import { serverEnv } from '@/lib/env';

// Token format: <scope>.<id>.<exp>.<sig> where
//   scope ∈ {group, staff}, id is the subject UUID, exp is unix-ms,
//   sig = HMAC-SHA256("<scope>|<id>|<exp>", LIFECYCLE_EMAIL_UNSUB_SECRET).hex[:32].
// A long TTL (90 days) so the link still works when an email is opened late;
// fresh tokens are minted on every subsequent send anyway.

const TTL_MS = 90 * 24 * 60 * 60 * 1000;

export type LifecycleUnsubScope = 'group' | 'staff';

/** Returns null when LIFECYCLE_EMAIL_UNSUB_SECRET is not configured. */
export function signLifecycleUnsubToken(
  scope: LifecycleUnsubScope,
  id: string,
  now: number = Date.now()
): string | null {
  const secret = serverEnv().LIFECYCLE_EMAIL_UNSUB_SECRET;
  if (!secret) return null;
  const exp = now + TTL_MS;
  const sig = crypto
    .createHmac('sha256', secret)
    .update(`${scope}|${id}|${exp}`)
    .digest('hex')
    .slice(0, 32);
  return `${scope}.${id}.${exp}.${sig}`;
}

export function verifyLifecycleUnsubToken(
  token: string,
  now: number = Date.now()
): { scope: LifecycleUnsubScope; id: string } | null {
  const secret = serverEnv().LIFECYCLE_EMAIL_UNSUB_SECRET;
  if (!secret) return null;
  const parts = token.split('.');
  if (parts.length !== 4) return null;
  const [scope, id, expStr, sig] = parts;
  if (scope !== 'group' && scope !== 'staff') return null;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || now > exp) return null;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${scope}|${id}|${expStr}`)
    .digest('hex')
    .slice(0, 32);
  const sigBuf = Buffer.from(sig, 'hex');
  const expectedBuf = Buffer.from(expected, 'hex');
  if (sigBuf.length !== expectedBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;
  return { scope, id };
}
