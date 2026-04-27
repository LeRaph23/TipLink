/**
 * /api/stripe/create-intent unit tests.
 *
 * Covers input validation, rate-limiting, and idempotent replay
 * of the pending-transaction insert (unique_violation path).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/stripe/client', () => ({
  stripe: {
    paymentIntents: {
      create: vi.fn(),
    },
  },
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(),
}));

function buildRequest(body: unknown, ip = '1.2.3.4'): NextRequest {
  return new NextRequest('https://test.example.com/api/stripe/create-intent', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: {
      'Content-Type': 'application/json',
      'x-forwarded-for': ip,
    },
  });
}

function supabaseMock(opts: {
  staff?: { stripe_account_id: string; onboarding_status: string; establishment_id: string } | null;
  insertError?: { code: string } | null;
  existingTxnId?: string | null;
  platformFeeBps?: number;
}) {
  const staffChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: opts.staff
        ? { id: 'staff-1', full_name: 'Jane', ...opts.staff }
        : null,
    }),
  };

  // Platform fee defaults to 0 so tests that check application_fee_amount
  // is absent remain valid (fee is only added when > 0).
  const feeBps = opts.platformFeeBps ?? 0;

  let txnCall = 0;
  return {
    from: vi.fn((table: string) => {
      if (table === 'staff_profiles') return staffChain;
      if (table === 'establishments') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: opts.staff?.establishment_id ? { group_id: 'group-1' } : null,
            error: null,
          }),
        };
      }
      if (table === 'groups') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: { platform_fee_bps: feeBps },
            error: null,
          }),
        };
      }
      if (table === 'transactions') {
        txnCall += 1;
        if (txnCall === 1) {
          // first call = INSERT new pending txn
          return {
            insert: vi.fn().mockReturnThis(),
            select: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue(
              opts.insertError
                ? { data: null, error: opts.insertError }
                : { data: { id: 'txn-new-1' }, error: null }
            ),
          };
        }
        // second call = lookup after unique_violation
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: opts.existingTxnId ? { id: opts.existingTxnId } : null,
          }),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    }),
  };
}

describe('POST /api/stripe/create-intent', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    process.env.STRIPE_SECRET_KEY = 'sk_test_mock';
  });

  it('400 on missing parameters', async () => {
    const { POST } = await import('@/app/api/stripe/create-intent/route');
    const res = await POST(buildRequest({ staffId: '', amount: 0 }, '10.0.0.1'));
    expect(res.status).toBe(400);
  });

  it('400 when amount is below 50 cents', async () => {
    const { POST } = await import('@/app/api/stripe/create-intent/route');
    const res = await POST(
      buildRequest(
        { staffId: 'aaa', amount: 49, currency: 'EUR', nonce: 'n' },
        '10.0.0.2'
      )
    );
    expect(res.status).toBe(400);
  });

  it('404 when staff is not found / not ready', async () => {
    const { createServiceClient } = await import('@/lib/supabase/service');
    vi.mocked(createServiceClient).mockReturnValue(
      supabaseMock({ staff: null }) as never
    );

    const { POST } = await import('@/app/api/stripe/create-intent/route');
    const res = await POST(
      buildRequest(
        { staffId: 'missing', amount: 500, currency: 'EUR', nonce: 'n' },
        '10.0.0.3'
      )
    );
    expect(res.status).toBe(404);
  });

  it('returns clientSecret on happy path', async () => {
    const { createServiceClient } = await import('@/lib/supabase/service');
    vi.mocked(createServiceClient).mockReturnValue(
      supabaseMock({
        staff: {
          stripe_account_id: 'acct_1',
          onboarding_status: 'complete',
          establishment_id: 'est-1',
        },
      }) as never
    );

    const { stripe } = await import('@/lib/stripe/client');
    vi.mocked(stripe.paymentIntents.create).mockResolvedValue({
      id: 'pi_1',
      client_secret: 'pi_1_secret_abc',
    } as never);

    const { POST } = await import('@/app/api/stripe/create-intent/route');
    const res = await POST(
      buildRequest(
        { staffId: 'staff-1', amount: 500, currency: 'EUR', nonce: 'nonce-1' },
        '10.0.0.4'
      )
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.clientSecret).toBe('pi_1_secret_abc');

    // Stripe fees must be borne by the connected account, not the
    // platform. `on_behalf_of` + `transfer_data.destination` on the
    // same account is the contract we rely on. No `application_fee_amount`.
    expect(stripe.paymentIntents.create).toHaveBeenCalledWith(
      expect.objectContaining({
        on_behalf_of: 'acct_1',
        transfer_data: { destination: 'acct_1' },
      }),
      expect.objectContaining({ idempotencyKey: expect.any(String) })
    );
    const [intentArgs] = vi.mocked(stripe.paymentIntents.create).mock.calls[0]!;
    expect((intentArgs as { application_fee_amount?: number }).application_fee_amount).toBeUndefined();
  });

  it('on unique_violation (23505), reuses existing pending transaction', async () => {
    const { createServiceClient } = await import('@/lib/supabase/service');
    vi.mocked(createServiceClient).mockReturnValue(
      supabaseMock({
        staff: {
          stripe_account_id: 'acct_1',
          onboarding_status: 'complete',
          establishment_id: 'est-1',
        },
        insertError: { code: '23505' },
        existingTxnId: 'txn-existing-1',
      }) as never
    );

    const { stripe } = await import('@/lib/stripe/client');
    vi.mocked(stripe.paymentIntents.create).mockResolvedValue({
      id: 'pi_reuse',
      client_secret: 'pi_reuse_secret',
    } as never);

    const { POST } = await import('@/app/api/stripe/create-intent/route');
    const res = await POST(
      buildRequest(
        { staffId: 'staff-1', amount: 500, currency: 'EUR', nonce: 'nonce-dup' },
        '10.0.0.5'
      )
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.transactionId).toBe('txn-existing-1');
  });

  it('rate-limits the 6th request within the window (429)', async () => {
    const { createServiceClient } = await import('@/lib/supabase/service');
    // First 5 calls should pass validation & reach Stripe; 6th hits rate limit.
    vi.mocked(createServiceClient).mockImplementation(
      () =>
        supabaseMock({
          staff: {
            stripe_account_id: 'acct_1',
            onboarding_status: 'complete',
            establishment_id: 'est-1',
          },
        }) as never
    );
    const { stripe } = await import('@/lib/stripe/client');
    vi.mocked(stripe.paymentIntents.create).mockResolvedValue({
      id: 'pi_rl',
      client_secret: 'pi_rl_secret',
    } as never);

    const { POST } = await import('@/app/api/stripe/create-intent/route');

    const ip = '99.99.99.99';
    const mkReq = (i: number) =>
      buildRequest(
        { staffId: 'staff-1', amount: 500, currency: 'EUR', nonce: `n-${i}` },
        ip
      );

    for (let i = 0; i < 5; i++) {
      const r = await POST(mkReq(i));
      expect(r.status).toBe(200);
    }
    const limited = await POST(mkReq(6));
    expect(limited.status).toBe(429);
  });
});
