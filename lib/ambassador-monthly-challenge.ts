import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

// All callers pass a service-role client (RLS bypassed): ambassador-facing
// reads, the settlement cron, and super-admin actions.
type Service = SupabaseClient<Database>;

export type ActiveChallenge = {
  id: string;
  prizeCents: number;
  startsAt: string;
  endsAt: string;
};

/**
 * The challenge currently visible to ambassadors: status 'active' and still
 * within its one-month window. Returns null once the window has elapsed (the
 * row stays 'active' until a settlement run flips it to 'settled').
 */
export async function getActiveChallenge(
  service: Service,
  now: Date = new Date()
): Promise<ActiveChallenge | null> {
  const { data } = await service
    .from('ambassador_monthly_challenges')
    .select('id, prize_cents, starts_at, ends_at')
    .eq('status', 'active')
    .gt('ends_at', now.toISOString())
    .maybeSingle();

  if (!data) return null;
  return {
    id: data.id,
    prizeCents: data.prize_cents,
    startsAt: data.starts_at,
    endsAt: data.ends_at,
  };
}

/**
 * Picks the winning ambassador from a list of in-window sales rows. Pure.
 * Ties on sale count are broken by ambassador id so the result is stable.
 */
export function pickChallengeWinner(
  sales: Array<{ ambassador_id: string }>
): { ambassadorId: string; salesCount: number } | null {
  const counts = new Map<string, number>();
  for (const s of sales) {
    counts.set(s.ambassador_id, (counts.get(s.ambassador_id) ?? 0) + 1);
  }
  const ranked = [...counts.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
  );
  const top = ranked[0];
  return top ? { ambassadorId: top[0], salesCount: top[1] } : null;
}

/**
 * Settles every challenge whose one-month window has elapsed: records the #1
 * ambassador and flips status to 'settled'. The winner's prize is NOT credited
 * automatically — the settled challenge surfaces in the super-admin "Bonus à
 * vérifier" panel, where the prize is released manually. The `status = 'active'`
 * guard on the update makes concurrent runs idempotent. Returns the count
 * settled. Voided sales (refunds / chargebacks) are excluded from the ranking.
 */
export async function settleExpiredChallenges(
  service: Service,
  now: Date = new Date()
): Promise<number> {
  const nowIso = now.toISOString();

  const { data: expired } = await service
    .from('ambassador_monthly_challenges')
    .select('id, starts_at, ends_at')
    .eq('status', 'active')
    .lte('ends_at', nowIso);

  let settled = 0;
  for (const ch of expired ?? []) {
    const { data: sales } = await service
      .from('ambassador_sales')
      .select('ambassador_id')
      .is('voided_at', null)
      .gte('created_at', ch.starts_at)
      .lte('created_at', ch.ends_at);

    const winner = pickChallengeWinner(sales ?? []);

    const { data: updated } = await service
      .from('ambassador_monthly_challenges')
      .update({
        status: 'settled',
        settled_at: nowIso,
        winner_ambassador_id: winner?.ambassadorId ?? null,
        winner_sales_count: winner?.salesCount ?? 0,
      })
      .eq('id', ch.id)
      .eq('status', 'active')
      .select('id');

    if (updated && updated.length > 0) settled += 1;
  }
  return settled;
}
