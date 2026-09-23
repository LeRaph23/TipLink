/**
 * /api/stripe/create-group-intent unit tests.
 *
 * This route had no test file at all, which is how it shipped with a team-tip
 * button that was simply dead above thirteen staff: it packed every active
 * staff member's UUID into one PaymentIntent metadata value, Stripe caps a
 * metadata value at 500 characters, and 14 UUIDs plus separators is 518. The
 * create call threw, and with no try/catch the throw escaped the handler, so
 * the tipper got a 500 with no JSON body.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/stripe/client', () => ({
  stripe: { paymentIntents: { create: vi.fn() } },
}));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: vi.fn() }));

const EST = '11111111-2222-4333-8444-555555555555';

/** Stripe's documented ceiling for a single metadata value. */
const STRIPE_METADATA_VALUE_MAX = 500;

function buildRequest(body: unknown, ip: string) {
  return new NextRequest('https://test.example.com/api/stripe/create-group-intent', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip },
  });
}

function serviceMock(staffCount: number) {
  const staff = Array.from({ length: staffCount }, (_, i) => ({
    id: `${String(i).padStart(8, '0')}-aaaa-4bbb-8ccc-dddddddddddd`,
  }));

  const chain = (result: unknown) => {
    const c: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'is', 'order', 'limit']) c[m] = vi.fn(() => c);
    c.single = vi.fn().mockResolvedValue(result);
    c.maybeSingle = vi.fn().mockResolvedValue(result);
    c.then = undefined;
    return c;
  };

  return {
    from: vi.fn((table: string) => {
      if (table === 'establishments') {
        return chain({
          data: {
            id: EST,
            group_id: 'g1',
            stripe_account_id: 'acct_est_1',
            stripe_charges_enabled: true,
            stripe_payouts_enabled: true,
            is_demo: false,
          },
          error: null,
        });
      }
      if (table === 'groups') {
        return chain({ data: { platform_fee_bps: 500, platform_fixed_fee_cents: 25 }, error: null });
      }
      if (table === 'staff_profiles') {
        // The active-staff read is awaited directly, with no terminal method.
        const c: Record<string, unknown> = {};
        const result = Promise.resolve({ data: staff, error: null });
        for (const m of ['select', 'eq', 'is']) c[m] = vi.fn(() => c);
        c.then = result.then.bind(result);
        return c;
      }
      if (table === 'transactions') {
        const c: Record<string, unknown> = {};
        for (const m of ['select', 'eq', 'is']) c[m] = vi.fn(() => c);
        c.insert = vi.fn(() => c);
        c.single = vi.fn().mockResolvedValue({ data: { id: 'txn-1' }, error: null });
        return c;
      }
      return chain({ data: null, error: null });
    }),
  };
}

async function callRoute(staffCount: number, ip: string) {
  const { createServiceClient } = await import('@/lib/supabase/service');
  vi.mocked(createServiceClient).mockReturnValue(serviceMock(staffCount) as never);
  const { POST } = await import('@/app/api/stripe/create-group-intent/route');
  // tip 1000 + fee (25 fixed + 5% = 50) = 1075
  return POST(buildRequest(
    { establishmentId: EST, amount: 1075, tipAmount: 1000, currency: 'eur', nonce: 'nonce-12345678' },
    ip,
  ));
}

describe('POST /api/stripe/create-group-intent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('records the transfer as pending so a stuck tip stays visible to the crons', async () => {
    const { stripe } = await import('@/lib/stripe/client');
    vi.mocked(stripe.paymentIntents.create).mockResolvedValue({
      id: 'pi_1', client_secret: 'cs_1',
    } as never);

    const svc = serviceMock(3);
    const { createServiceClient } = await import('@/lib/supabase/service');
    vi.mocked(createServiceClient).mockReturnValue(svc as never);
    const { POST } = await import('@/app/api/stripe/create-group-intent/route');
    await POST(buildRequest(
      { establishmentId: EST, amount: 1075, tipAmount: 1000, currency: 'eur', nonce: 'nonce-abcdefgh' },
      '10.0.0.9',
    ));

    const txnChain = svc.from.mock.results
      .map((r) => r.value as { insert?: ReturnType<typeof vi.fn> })
      .find((v) => v.insert);
    expect(txnChain?.insert).toHaveBeenCalledWith(
      expect.objectContaining({ transfer_status: 'pending' }),
    );
  });

  // 14 x 37 = 518 characters, which is what used to break.
  it('succeeds with 14 staff, and with 50', async () => {
    const { stripe } = await import('@/lib/stripe/client');
    for (const [i, count] of [14, 50].entries()) {
      vi.mocked(stripe.paymentIntents.create).mockResolvedValue({
        id: 'pi_x', client_secret: 'cs_x',
      } as never);
      const res = await callRoute(count, `10.1.0.${i}`);
      expect(res.status, `${count} staff`).toBe(200);
      await expect(res.json()).resolves.toMatchObject({ staffCount: count });
    }
  });

  it('keeps every metadata value inside Stripe limit regardless of team size', async () => {
    const { stripe } = await import('@/lib/stripe/client');
    vi.mocked(stripe.paymentIntents.create).mockResolvedValue({
      id: 'pi_2', client_secret: 'cs_2',
    } as never);

    await callRoute(200, '10.2.0.1');

    const [args] = vi.mocked(stripe.paymentIntents.create).mock.calls.at(-1)!;
    const metadata = (args as { metadata: Record<string, string> }).metadata;
    for (const [key, value] of Object.entries(metadata)) {
      expect(String(value).length, `metadata.${key}`).toBeLessThanOrEqual(STRIPE_METADATA_VALUE_MAX);
    }
    // The offending key is gone entirely: the webhook re-queries staff_profiles.
    expect(metadata).not.toHaveProperty('staff_ids');
  });

  it('answers JSON rather than letting a Stripe error escape the handler', async () => {
    const { stripe } = await import('@/lib/stripe/client');
    vi.mocked(stripe.paymentIntents.create).mockRejectedValue(
      Object.assign(new Error('Metadata values can have up to 500 characters'), {
        type: 'StripeInvalidRequestError',
      }),
    );

    const res = await callRoute(14, '10.3.0.1');
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: 'payment_failed' });
  });
});
