import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/stripe/client', () => ({
  stripe: { transfers: { list: vi.fn() } },
}));

import { settlePayoutTransferError } from '@/lib/stripe/payout-settlement';
import { stripe } from '@/lib/stripe/client';

const DEST = 'acct_123';
const PAYOUT = 'payout-abc';

describe('settlePayoutTransferError', () => {
  beforeEach(() => vi.clearAllMocks());

  // The double-payment scenario: Stripe created the transfer, the response
  // never arrived. Treating this as "failed" released the balance, and the next
  // request minted a new payout row with a new idempotency key, so Stripe had
  // no reason to deduplicate and sent the money a second time.
  it('reports paid when Stripe actually has the transfer', async () => {
    vi.mocked(stripe.transfers.list).mockResolvedValue({
      data: [
        { id: 'tr_other', metadata: { payout_id: 'someone-else' } },
        { id: 'tr_ours', metadata: { payout_id: PAYOUT } },
      ],
    } as never);

    const res = await settlePayoutTransferError(new Error('socket hang up'), {
      destination: DEST,
      payoutId: PAYOUT,
    });
    expect(res).toEqual({ outcome: 'paid', transferId: 'tr_ours' });
  });

  it('reports failed when Stripe definitively does not have it', async () => {
    vi.mocked(stripe.transfers.list).mockResolvedValue({
      data: [{ id: 'tr_other', metadata: { payout_id: 'someone-else' } }],
    } as never);

    const res = await settlePayoutTransferError(new Error('balance_insufficient'), {
      destination: DEST,
      payoutId: PAYOUT,
    });
    expect(res.outcome).toBe('failed');
    if (res.outcome === 'failed') expect(res.message).toBe('balance_insufficient');
  });

  // The critical one: if we cannot find out, we must not claim to know. The
  // caller leaves the payout pending so the amount stays committed.
  it('reports indeterminate when the lookup itself fails', async () => {
    vi.mocked(stripe.transfers.list).mockRejectedValue(new Error('ECONNRESET'));

    const res = await settlePayoutTransferError(new Error('socket hang up'), {
      destination: DEST,
      payoutId: PAYOUT,
    });
    expect(res.outcome).toBe('indeterminate');
  });

  it('scopes the lookup to the destination account', async () => {
    vi.mocked(stripe.transfers.list).mockResolvedValue({ data: [] } as never);
    await settlePayoutTransferError(new Error('x'), { destination: DEST, payoutId: PAYOUT });
    expect(stripe.transfers.list).toHaveBeenCalledWith(
      expect.objectContaining({ destination: DEST }),
    );
  });

  it('does not mistake a transfer with no metadata for ours', async () => {
    vi.mocked(stripe.transfers.list).mockResolvedValue({
      data: [{ id: 'tr_nometa' }, { id: 'tr_empty', metadata: {} }],
    } as never);
    const res = await settlePayoutTransferError(new Error('x'), {
      destination: DEST,
      payoutId: PAYOUT,
    });
    expect(res.outcome).toBe('failed');
  });
});
