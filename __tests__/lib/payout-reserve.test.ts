import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { reservePartnerPayout } from '@/lib/payouts/reserve';

function fakeService(result: { data: unknown; error: unknown }) {
  const rpc = vi.fn().mockResolvedValue(result);
  return { client: { rpc } as unknown as SupabaseClient, rpc };
}

describe('reservePartnerPayout', () => {
  it('passes the committed total the balance was computed from', async () => {
    const { client, rpc } = fakeService({ data: 'payout-id', error: null });
    await expect(reservePartnerPayout(client, 'ambassador', 'amb-1', 5000, 12000))
      .resolves.toEqual({ ok: true, id: 'payout-id' });
    expect(rpc).toHaveBeenCalledWith('reserve_partner_payout', {
      p_kind: 'ambassador', p_partner_id: 'amb-1', p_amount_cents: 5000, p_expected_committed: 12000,
    });
  });

  it('reports a concurrent withdrawal (stale balance) as busy', async () => {
    const { client } = fakeService({ data: null, error: { code: '40001', message: 'stale_balance' } });
    await expect(reservePartnerPayout(client, 'commercial', 'c-1', 5000, 0))
      .resolves.toEqual({ ok: false, reason: 'busy' });
  });

  it('reports the one-pending-payout index as busy', async () => {
    const { client } = fakeService({ data: null, error: { code: '23505', message: 'duplicate' } });
    await expect(reservePartnerPayout(client, 'ambassador', 'a', 5000, 0))
      .resolves.toEqual({ ok: false, reason: 'busy' });
  });

  it('reports anything else as an error', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { client } = fakeService({ data: null, error: { code: 'XX000', message: 'boom' } });
    await expect(reservePartnerPayout(client, 'ambassador', 'a', 5000, 0))
      .resolves.toEqual({ ok: false, reason: 'error' });
    spy.mockRestore();
  });
});
