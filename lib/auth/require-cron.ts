import { serverEnv } from '@/lib/env';

// Returns true when the request carries the expected `Authorization: Bearer <CRON_SECRET>`.
// All Vercel cron handlers go through this — the secret is required at boot in env.ts.
export function isAuthorizedCronRequest(request: Request): boolean {
  const expected = serverEnv().CRON_SECRET;
  const got = request.headers.get('authorization') ?? request.headers.get('Authorization');
  if (!got) return false;
  const prefix = 'Bearer ';
  if (!got.startsWith(prefix)) return false;
  const token = got.slice(prefix.length);
  // Constant-time-ish compare — token lengths can leak but that's bounded by `min(16)`.
  if (token.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < token.length; i++) {
    mismatch |= token.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return mismatch === 0;
}
