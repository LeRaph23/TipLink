import type { SupabaseClient } from '@supabase/supabase-js';

export type PartnerKind = 'ambassador' | 'commercial';

export type Reservation =
  | { ok: true; id: string }
  | { ok: false; reason: 'busy' | 'error' };

/**
 * Inserts a `pending` payout for a partner, but only if the partner's committed
 * total (pending + paid + failed-with-a-transfer) is still the one the caller
 * computed the available balance from.
 *
 * reserve_partner_payout (migration 00089) takes a row lock on the partner, so
 * two requests racing for the same balance are serialized: the second sees a
 * different committed total and is refused, instead of minting a second
 * transfer for money already paid out. This replaces session-level advisory
 * locks, which PostgREST's connection pool could not hold reliably.
 */
export async function reservePartnerPayout(
  service: SupabaseClient,
  kind: PartnerKind,
  partnerId: string,
  amountCents: number,
  expectedCommittedCents: number,
): Promise<Reservation> {
  const { data, error } = await service.rpc('reserve_partner_payout', {
    p_kind: kind,
    p_partner_id: partnerId,
    p_amount_cents: amountCents,
    p_expected_committed: expectedCommittedCents,
  });

  if (error) {
    // 40001 = stale_balance (another request moved the balance first);
    // 23505 = the one-pending-payout-per-partner unique index.
    if (error.code === '40001' || error.code === '23505') return { ok: false, reason: 'busy' };
    console.error(`[payout] ${kind} reservation failed`, error);
    return { ok: false, reason: 'error' };
  }
  if (typeof data !== 'string') return { ok: false, reason: 'error' };
  return { ok: true, id: data };
}
