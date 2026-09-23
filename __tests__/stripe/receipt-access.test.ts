import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/stripe/client', () => ({
  stripe: { paymentIntents: { retrieve: vi.fn() } },
}));

import { stripe } from '@/lib/stripe/client';
import { customerHoldsPayment } from '@/lib/stripe/receipt-access';

const retrieve = vi.mocked(stripe.paymentIntents.retrieve);

describe('customerHoldsPayment', () => {
  beforeEach(() => {
    retrieve.mockReset();
    retrieve.mockResolvedValue({
      client_secret: 'pi_123_secret_abc',
      metadata: { transaction_id: 'txn-1' },
    } as never);
  });

  it('opens the receipt for the payment the secret belongs to', async () => {
    expect(await customerHoldsPayment('txn-1', 'pi_123', 'pi_123_secret_abc')).toBe(true);
  });

  it('refuses a wrong secret', async () => {
    expect(await customerHoldsPayment('txn-1', 'pi_123', 'pi_123_secret_xyz')).toBe(false);
  });

  it('refuses a valid secret presented for another tip', async () => {
    expect(await customerHoldsPayment('txn-2', 'pi_123', 'pi_123_secret_abc')).toBe(false);
  });

  it('refuses without both parameters, and never asks Stripe', async () => {
    expect(await customerHoldsPayment('txn-1', 'pi_123', undefined)).toBe(false);
    expect(await customerHoldsPayment('txn-1', undefined, 'pi_123_secret_abc')).toBe(false);
    expect(retrieve).not.toHaveBeenCalled();
  });

  it('refuses when Stripe cannot confirm', async () => {
    retrieve.mockRejectedValueOnce(new Error('No such payment_intent'));
    expect(await customerHoldsPayment('txn-1', 'pi_123', 'pi_123_secret_abc')).toBe(false);
  });
});
