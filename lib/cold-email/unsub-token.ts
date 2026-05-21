import crypto from 'node:crypto';
import { serverEnv } from '@/lib/env';

// Token format: <siret>.<exp>.<sig>
// Matches the verifier in app/api/cold-email/unsubscribe/[token]/route.ts.
// `exp` is unix-ms timestamp; tokens auto-expire so a leaked link from an old
// email can't be reused indefinitely.

const DEFAULT_TTL_MS = 365 * 24 * 60 * 60 * 1000; // 1 year — covers all 3 sequence steps + late opens

export function signColdEmailUnsubToken(siret: string, ttlMs: number = DEFAULT_TTL_MS): string {
  const exp = Date.now() + ttlMs;
  const secret = serverEnv().COLD_EMAIL_UNSUB_SECRET;
  const sig = crypto
    .createHmac('sha256', secret)
    .update(`${siret}|${exp}`)
    .digest('hex')
    .slice(0, 32);
  return `${siret}.${exp}.${sig}`;
}
