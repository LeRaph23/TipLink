/**
 * /api/billing/checkout unit tests.
 *
 * Covers pack validation, auth, rate-limit, group creation + Stripe
 * Checkout session construction (mixed line_items).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/stripe/client', () => ({
  stripe: {
    customers: { create: vi.fn() },
    checkout: { sessions: { create: vi.fn() } },
  },
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(),
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
          existingGroup ?? {
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

describe('POST /api/billing/checkout', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    // Required by lib/env.ts public schema validation (runs at module load)
    process.env.NEXT_PUBLIC_BASE_URL = 'https://test.example.com';
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key-min-10-chars';
    process.env.STRIPE_SECRET_KEY = 'sk_test';
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

  it('creates Stripe checkout session for one-shot hardware purchase', async () => {
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

    vi.mocked(stripe.checkout.sessions.create).mockResolvedValue({
      id: 'cs_test_1',
      url: 'https://checkout.stripe.com/test',
    } as never);

    const { POST } = await import('@/app/api/billing/checkout/route');
    const res = await POST(
      buildRequest({
        pack: 'duo',
        business: {
          legal_name: 'Acme',
          shipping: {
            line1: '1 rue test',
            city: 'Paris',
            postal_code: '75001',
            country: 'FR',
          },
          billing_same_as_shipping: true,
        },
      }, '6.6.6.6')
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.url).toBe('https://checkout.stripe.com/test');

    const call = vi.mocked(stripe.checkout.sessions.create).mock.calls[0][0]!;
    expect(call.mode).toBe('payment');
    expect(call.line_items).toHaveLength(1);
    expect(call.line_items![0].price).toBe('price_duo_hw');
    expect(call.automatic_tax?.enabled).toBe(true);
    expect(call.tax_id_collection?.enabled).toBe(true);
    expect(call.metadata?.group_id).toBe('grp-1');
    expect(call.metadata?.pack).toBe('duo');
  });

  it('rate-limits after 5 requests per minute / IP', async () => {
    const { createClient } = await import('@/lib/supabase/server');
    const { createServiceClient } = await import('@/lib/supabase/service');
    const { stripe } = await import('@/lib/stripe/client');

    vi.mocked(createClient).mockResolvedValue(
      serverClientMock({ id: 'u1', email: 'a@b.c' }) as never
    );
    vi.mocked(createServiceClient).mockReturnValue(
      serviceClientMock({
        existingGroup: { id: 'grp-1', stripe_customer_id: 'cus_123' },
      }) as never
    );
    vi.mocked(stripe.checkout.sessions.create).mockResolvedValue({
      id: 'cs',
      url: 'https://checkout.stripe.com/x',
    } as never);

    const { POST } = await import('@/app/api/billing/checkout/route');

    const sharedIp = '9.9.9.9';
    for (let i = 0; i < 5; i++) {
      const ok = await POST(buildRequest({ pack: 'solo' }, sharedIp));
      expect(ok.status).toBe(200);
    }
    const limited = await POST(buildRequest({ pack: 'solo' }, sharedIp));
    expect(limited.status).toBe(429);
  });
});
