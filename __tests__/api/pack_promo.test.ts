/**
 * /api/billing/pack-promo applies a promo code to the /checkout intent the
 * buyer already holds, instead of creating a new one (which wiped the form,
 * hit the intent rate limit, and lost the "invalid code" message).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/stripe/client', () => ({
  stripe: { paymentIntents: { retrieve: vi.fn(), update: vi.fn() } },
}));
vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockResolvedValue({ ok: true, resetAt: 0 }),
  getClientIp: vi.fn().mockReturnValue('10.0.0.1'),
}));
vi.mock('@/lib/stripe/tax', () => ({
  // 20 % domestic VAT, as in production.
  provisionalPackTax: (ht: number) => ({ htAmount: ht, taxAmount: Math.round(ht * 0.2), totalAmount: ht + Math.round(ht * 0.2), country: 'FR' }),
  computePackTax: vi.fn(),
}));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: vi.fn() }));

import { stripe } from '@/lib/stripe/client';
import { createServiceClient } from '@/lib/supabase/service';
import { POST } from '@/app/api/billing/pack-promo/route';

const SECRET = 'pi_123_secret_abc';

function request(body: unknown) {
  return new NextRequest('https://test.example.com/api/billing/pack-promo', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

function promoTable(row: Record<string, unknown> | null) {
  vi.mocked(createServiceClient).mockReturnValue({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row }) }) }),
    }),
  } as never);
}

describe('POST /api/billing/pack-promo', () => {
  beforeEach(() => {
    vi.mocked(stripe.paymentIntents.retrieve).mockReset().mockResolvedValue({
      client_secret: SECRET,
      status: 'requires_payment_method',
      currency: 'eur',
      metadata: { source: 'pack-express', base_amount: '6900', discount_amount: '0', tax_provisional: 'true' },
    } as never);
    vi.mocked(stripe.paymentIntents.update).mockReset().mockResolvedValue({} as never);
  });

  it('applies a valid code to the same intent: 69 € - 20 % = 55,20 € HT + VAT', async () => {
    promoTable({ id: 'p1', code: 'TEST20', percentage_off: 20, is_active: true, max_redemptions: null, times_redeemed: 0, expires_at: null, stripe_promo_code_id: 'promo_1' });
    const res = await POST(request({ clientSecret: SECRET, promoCode: 'test20' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ promoCode: 'TEST20', discountAmount: 1380, htAmount: 5520, totalAmount: 6624 });
    expect(stripe.paymentIntents.update).toHaveBeenCalledWith('pi_123', expect.objectContaining({
      amount: 6624,
      metadata: expect.objectContaining({ discount_amount: '1380', promo_code: 'TEST20', promo_code_id: 'p1' }),
    }));
  });

  it('refuses an unknown or inactive code without touching the intent', async () => {
    promoTable({ id: 'p2', code: 'OLD10', percentage_off: 10, is_active: false, max_redemptions: null, times_redeemed: 0, expires_at: null, stripe_promo_code_id: 'promo_2' });
    const res = await POST(request({ clientSecret: SECRET, promoCode: 'OLD10' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid promo code');
    expect(stripe.paymentIntents.update).not.toHaveBeenCalled();
  });

  it('removes the code when none is given', async () => {
    promoTable(null);
    const res = await POST(request({ clientSecret: SECRET }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ promoCode: null, discountAmount: 0, totalAmount: 8280 });
    expect(stripe.paymentIntents.update).toHaveBeenCalledWith('pi_123', expect.objectContaining({
      metadata: expect.objectContaining({ promo_code: '', promo_code_id: '' }),
    }));
  });

  it('refuses a secret that does not match the intent', async () => {
    promoTable(null);
    const res = await POST(request({ clientSecret: 'pi_123_secret_other', promoCode: 'TEST20' }));
    expect(res.status).toBe(403);
    expect(stripe.paymentIntents.update).not.toHaveBeenCalled();
  });
});
