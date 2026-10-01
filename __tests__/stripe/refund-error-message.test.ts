import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/stripe/client', () => ({ stripe: {} }));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: vi.fn() }));

import { refundErrorMessage } from '@/lib/stripe/refunds';

describe('refundErrorMessage', () => {
  it('explains the known Stripe codes in French', () => {
    expect(refundErrorMessage({ code: 'charge_already_refunded' })).toMatch(/déjà été remboursé/);
    expect(refundErrorMessage({ code: 'charge_disputed' })).toMatch(/litige/);
    expect(refundErrorMessage({ code: 'balance_insufficient' })).toMatch(/Solde/);
  });
  it('never leaks the raw Stripe message', () => {
    expect(refundErrorMessage({ message: 'You cannot reverse_transfer' })).not.toMatch(/reverse_transfer/);
    expect(refundErrorMessage(null)).toMatch(/échoué/);
  });
});
