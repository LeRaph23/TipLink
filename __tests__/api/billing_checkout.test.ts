/**
 * /api/billing/checkout unit tests.
 *
 * The authenticated pack checkout creates an in-page PaymentIntent
 * (source: pack-order) rather than a Stripe-hosted Checkout Session.
 * Covers pack validation, auth, rate-limit and PaymentIntent construction.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/stripe/client', () => ({
  stripe: {
    customers: { create: vi.fn(), update: vi.fn() },
    paymentIntents: { create: vi.fn() },
  },
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(),
}));

vi.mock('@/lib/stripe/pricing', () => ({
  getPackPricing: vi.fn(),
}));

vi.mock('@/lib/stripe/tax', () => ({
  computePackTax: vi.fn(),
}));

function buildRequest(body: unknown, ip = '5.5.5.5'): NextRequest {
  return new NextRequest('https://test.example.com/api/billing/checkout', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: {
      'Content-Type': 'application/json',
      'x-forwarded-for': ip,
    },
  });
}

function serverClientMock(user: { id: string; email: string } | null) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user } }),
    },
  };
}

function serviceClientMock(opts: {
  existingGroup?: { id: string; stripe_customer_id: string | null } | null;
}) {
  const existingGroup = opts.existingGroup ?? null;

  const chain = (rows: unknown) => {
    const obj: Record<string, unknown> = {};
    obj.select = vi.fn().mockReturnValue(obj);
    obj.insert = vi.fn().mockReturnValue(obj);
    obj.update = vi.fn().mockReturnValue(obj);
    obj.eq = vi.fn().mockReturnValue(obj);
    obj.in = vi.fn().mockReturnValue(obj);
    obj.not = vi.fn().mockResolvedValue({ data: rows });
    obj.single = vi.fn().mockResolvedValue({ data: rows, error: null });
    obj.maybeSingle = vi.fn().mockResolvedValue({ data: rows, error: null });
    return obj;
  };

  return {
    from: vi.fn((table: string) => {
      if (table === 'user_roles') {
        return chain(existingGroup ? [{ group_id: existingGroup.id }] : []);
      }
      if (table === 'groups') {
        return chain(
          existingGroup
            ? { ...existingGroup, legal_name: 'Acme', vat_number: null, shipping_address: null }
            : {
                id: 'group-new',
                legal_name: 'Acme',
                vat_number: null,
                stripe_customer_id: null,
                shipping_address: null,
              }
        );
      }
      return chain(null);
    }),
  };
}

const validBusiness = {
  legal_name: 'Acme',
  shipping: { line1: '1 rue test', city: 'Paris', postal_code: '75001', country: 'FR' },
  billing_same_as_shipping: true,
};

async function primePricingMocks() {
  const { getPackPricing } = await import('@/lib/stripe/pricing');
  const { computePackTax } = await import('@/lib/stripe/tax');
  const { stripe } = await import('@/lib/stripe/client');
  vi.mocked(getPackPricing).mockResolvedValue({
    pack: 'duo', unitAmount: 9900, currency: 'eur',
    productName: 'Digitip — Pack Duo', quantity: 2, listAmount: null, savingsPercent: null,
  });
  vi.mocked(computePackTax).mockResolvedValue({
    htAmount: 9900, taxAmount: 1980, totalAmount: 11880,
    taxRatePercent: 20, country: 'FR', calculationId: null,
  });
  vi.mocked(stripe.paymentIntents.create).mockResolvedValue({
    id: 'pi_1', client_secret: 'pi_1_secret_x',
  } as never);
}

describe('POST /api/billing/checkout', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    process.env.NEXT_PUBLIC_BASE_URL = 'https://test.example.com';
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key-min-10-chars';
    process.env.STRIPE_SECRET_KEY = 'sk_test_unit_1234567890';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_unit_1234567890';
    process.env.CRON_SECRET = 'cron-test-secret-must-be-16-chars-or-more';
    process.env.COLD_EMAIL_UNSUB_SECRET = 'cold-email-test-secret-must-be-16-chars';
    process.env.ONBOARDING_TOKEN_SECRET = 'onboarding-test-secret-must-be-at-least-32-chars-long';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test-1234567890';
    process.env.STRIPE_PRICE_PACK_SOLO_HARDWARE = 'price_solo_hw';
    process.env.STRIPE_PRICE_PACK_DUO_HARDWARE  = 'price_duo_hw';
  });

  it('returns 400 on invalid pack', async () => {
    const { createClient } = await import('@/lib/supabase/server');
    vi.mocked(createClient).mockResolvedValue(
      serverClientMock({ id: 'u1', email: 'a@b.c' }) as never
    );

    const { POST } = await import('@/app/api/billing/checkout/route');
    const res = await POST(buildRequest({ pack: 'xl' }));
    expect(res.status).toBe(400);
  });

  it('returns 401 when no user session', async () => {
    const { createClient } = await import('@/lib/supabase/server');
    vi.mocked(createClient).mockResolvedValue(serverClientMock(null) as never);

    const { POST } = await import('@/app/api/billing/checkout/route');
    const res = await POST(buildRequest({ pack: 'solo' }));
    expect(res.status).toBe(401);
  });

  it('creates an in-page PaymentIntent for a one-shot hardware purchase', async () => {
    const { createClient } = await import('@/lib/supabase/server');
    const { createServiceClient } = await import('@/lib/supabase/service');
    const { stripe } = await import('@/lib/stripe/client');

    vi.mocked(createClient).mockResolvedValue(
      serverClientMock({ id: 'u1', email: 'owner@acme.test' }) as never
    );
    vi.mocked(createServiceClient).mockReturnValue(
      serviceClientMock({
        existingGroup: { id: 'grp-1', stripe_customer_id: 'cus_123' },
      }) as never
    );
    await primePricingMocks();

    const { POST } = await import('@/app/api/billing/checkout/route');
    const res = await POST(
      buildRequest({ pack: 'duo', business: validBusiness }, '6.6.6.6')
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.clientSecret).toBe('pi_1_secret_x');
    expect(body.amount).toBe(11880);
    expect(body.taxAmount).toBe(1980);

    const call = vi.mocked(stripe.paymentIntents.create).mock.calls[0][0]!;
    expect(call.amount).toBe(11880);
    expect(call.customer).toBe('cus_123');
    expect(call.metadata?.source).toBe('pack-order');
    expect(call.metadata?.group_id).toBe('grp-1');
    expect(call.metadata?.pack).toBe('duo');
  });

  it('returns 400 when the shipping address is missing', async () => {
    const { createClient } = await import('@/lib/supabase/server');
    const { createServiceClient } = await import('@/lib/supabase/service');

    vi.mocked(createClient).mockResolvedValue(
      serverClientMock({ id: 'u1', email: 'a@b.c' }) as never
    );
    vi.mocked(createServiceClient).mockReturnValue(
      serviceClientMock({
        existingGroup: { id: 'grp-1', stripe_customer_id: 'cus_123' },
      }) as never
    );
    await primePricingMocks();

    const { POST } = await import('@/app/api/billing/checkout/route');
    const res = await POST(buildRequest({ pack: 'duo' }, '7.7.7.7'));
    expect(res.status).toBe(400);
  });

  it('rate-limits after 5 requests per minute / IP', async () => {
    const { createClient } = await import('@/lib/supabase/server');
    const { createServiceClient } = await import('@/lib/supabase/service');

    vi.mocked(createClient).mockResolvedValue(
      serverClientMock({ id: 'u1', email: 'a@b.c' }) as never
    );
    vi.mocked(createServiceClient).mockReturnValue(
      serviceClientMock({
        existingGroup: { id: 'grp-1', stripe_customer_id: 'cus_123' },
      }) as never
    );
    await primePricingMocks();

    const { POST } = await import('@/app/api/billing/checkout/route');

    const sharedIp = '9.9.9.9';
    for (let i = 0; i < 5; i++) {
      const ok = await POST(buildRequest({ pack: 'duo', business: validBusiness }, sharedIp));
      expect(ok.status).toBe(200);
    }
    const limited = await POST(buildRequest({ pack: 'duo', business: validBusiness }, sharedIp));
    expect(limited.status).toBe(429);
  });
});
