import type { SupabaseClient } from '@supabase/supabase-js';

export type PinPortal = 'ambassador' | 'commercial';

// Per IP + code: a typo-prone human gets a few tries.
export const PIN_IP_WINDOW_MS = 15 * 60 * 1000;
export const PIN_MAX_IP_ATTEMPTS = 5;

// Per code, across every IP: the backstop against IP rotation. The code is a
// public promo code and the PIN has 10 000 values, so this is what bounds a
// brute force: 10 guesses an hour and 40 a day put the whole keyspace ~250
// days away, while a legitimate partner locked out by an attacker waits an
// hour at most.
export const PIN_CODE_WINDOW_MS = 60 * 60 * 1000;
export const PIN_MAX_CODE_ATTEMPTS = 10;
export const PIN_DAY_WINDOW_MS = 24 * 60 * 60 * 1000;
export const PIN_MAX_DAY_ATTEMPTS = 40;

export type PinAttemptVerdict =
  | { ok: true }
  | { ok: false; reason: 'ip' | 'code' | 'day' | 'error' };

function pgInterval(ms: number): string {
  return `${Math.round(ms / 1000)} seconds`;
}

/**
 * Records one PIN guess and says whether it may be checked.
 *
 * The attempt is inserted and counted in one transaction under a lock on the
 * code (register_pin_attempt, migration 00089). The previous count-then-insert
 * let a burst of parallel requests all read the same count and all get through.
 * Called before the PIN is even looked at, so every guess costs one attempt.
 */
export async function registerPinAttempt(
  service: SupabaseClient,
  portal: PinPortal,
  code: string,
  ipHash: string,
): Promise<PinAttemptVerdict> {
  const call = (codeWindowMs: number) =>
    service.rpc('register_pin_attempt', {
      p_portal: portal,
      p_code: code,
      p_ip_hash: ipHash,
      p_ip_window: pgInterval(PIN_IP_WINDOW_MS),
      p_code_window: pgInterval(codeWindowMs),
    });

  const { data, error } = await call(PIN_CODE_WINDOW_MS);
  const row = Array.isArray(data) ? (data[0] as { ip_count: number; code_count: number } | undefined) : undefined;
  if (error || !row) {
    // Fail closed: an unverifiable rate limit must not open the PIN check.
    console.error(`[pin] ${portal} attempt registration failed`, error);
    return { ok: false, reason: 'error' };
  }
  if (Number(row.ip_count) > PIN_MAX_IP_ATTEMPTS) return { ok: false, reason: 'ip' };
  if (Number(row.code_count) > PIN_MAX_CODE_ATTEMPTS) return { ok: false, reason: 'code' };

  // Daily ceiling, read-only (the attempt above is already recorded).
  const table = portal === 'ambassador' ? 'ambassador_pin_attempts' : 'commercial_pin_attempts';
  const { count } = await service
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq('code', code.toLowerCase())
    .gte('attempted_at', new Date(Date.now() - PIN_DAY_WINDOW_MS).toISOString());
  if ((count ?? 0) > PIN_MAX_DAY_ATTEMPTS) return { ok: false, reason: 'day' };

  return { ok: true };
}
