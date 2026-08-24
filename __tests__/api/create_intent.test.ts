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
  platformFixedFeeCents?: number;
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

  // The variable part defaults to 0 so most cases can keep charging
  // tip + the 25 c fixed fee; the fee-model cases set it explicitly.
  const feeBps = opts.platformFeeBps ?? 0;
  const feeFixedCents = opts.platformFixedFeeCents ?? 25;

  let txnCall = 0;
  return {
    from: vi.fn((table: string) => {
      if (table === 'staff_profiles') return staffChain;
      if (table === 'establishments') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          is: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: opts.staff?.establishment_id ? { group_id: 'group-1' } : null,
            error: null,
          }),
        };
      }
      if (table === 'groups') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          is: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: { platform_fee_bps: feeBps, platform_fixed_fee_cents: feeFixedCents },
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
        { staffId: '550e8400-e29b-41d4-a716-446655440002', amount: 525, tipAmount: 500, currency: 'EUR', nonce: 'nonce-missing-long' },
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
        { staffId: '550e8400-e29b-41d4-a716-446655440001', amount: 525, tipAmount: 500, currency: 'EUR', nonce: 'nonce-1-long-enough' },
        '10.0.0.4'
      )
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.clientSecret).toBe('pi_1_secret_abc');

    // Deferred onboarding: the tip is captured on the platform via a separate
    // charge (no transfer_data / application_fee) and held, then transferred to
    // the staff member once they finish onboarding. The PaymentIntent carries a
    // transfer_group tying it to the transaction for the later transfer.
    const callArg = vi.mocked(stripe.paymentIntents.create).mock.calls[0][0] as unknown as Record<string, unknown>;
    expect(callArg.transfer_data).toBeUndefined();
    expect(callArg.application_fee_amount).toBeUndefined();
    expect(callArg.transfer_group).toBe('tip_txn-new-1');
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
        { staffId: '550e8400-e29b-41d4-a716-446655440001', amount: 525, tipAmount: 500, currency: 'EUR', nonce: 'nonce-dup-long-enough' },
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
        { staffId: '550e8400-e29b-41d4-a716-446655440001', amount: 525, tipAmount: 500, currency: 'EUR', nonce: `nonce-${i}-long-enough` },
        ip
      );

    for (let i = 0; i < 5; i++) {
      const r = await POST(mkReq(i));
      expect(r.status).toBe(200);
    }
    const limited = await POST(mkReq(6));
    expect(limited.status).toBe(429);
  });

  // ── Fee model (see lib/pricing/tip-fees.ts) ────────────────────────────────
  // The tipper pays tip + fixed + variable; the recipient keeps 100 % of the
  // tip. The server recomputes the total and refuses anything else.

  it('charges tip + fixed + variable fee, and keeps nothing from the tip', async () => {
    const { createServiceClient } = await import('@/lib/supabase/service');
    vi.mocked(createServiceClient).mockReturnValue(
      supabaseMock({
        staff: {
          stripe_account_id: 'acct_1',
          onboarding_status: 'complete',
          establishment_id: 'est-1',
        },
        platformFeeBps: 500,
        platformFixedFeeCents: 25,
      }) as never
    );

    const { stripe } = await import('@/lib/stripe/client');
    vi.mocked(stripe.paymentIntents.create).mockResolvedValue({
      id: 'pi_fee',
      client_secret: 'pi_fee_secret',
    } as never);

    const { POST } = await import('@/app/api/stripe/create-intent/route');
    // 5,00 € tip → 0,25 € + 5 % = 0,50 € of fee → 5,50 € debited.
    const res = await POST(
      buildRequest(
        { staffId: '550e8400-e29b-41d4-a716-446655440001', amount: 550, tipAmount: 500, currency: 'EUR', nonce: 'nonce-fee-model-ok' },
        '10.0.0.6'
      )
    );
    expect(res.status).toBe(200);

    const callArg = vi.mocked(stripe.paymentIntents.create).mock.calls[0][0] as unknown as {
      amount: number;
      metadata: Record<string, string>;
    };
    expect(callArg.amount).toBe(550);
    expect(callArg.metadata.tip_amount).toBe('500');
    expect(callArg.metadata.service_fee).toBe('50');
    // The whole tip goes to the recipient — nothing is deducted from it.
    expect(callArg.metadata.net_for_staff).toBe('500');
    // The legacy "commission taken out of the tip" key must not come back:
    // the webhook reads its absence as zero deduction.
    expect(callArg.metadata.platform_fee).toBeUndefined();
  });

  it('400 when the requested amount omits the variable fee', async () => {
    const { createServiceClient } = await import('@/lib/supabase/service');
    vi.mocked(createServiceClient).mockReturnValue(
      supabaseMock({
        staff: {
          stripe_account_id: 'acct_1',
          onboarding_status: 'complete',
          establishment_id: 'est-1',
        },
        platformFeeBps: 500,
        platformFixedFeeCents: 25,
      }) as never
    );

    const { POST } = await import('@/app/api/stripe/create-intent/route');
    // A stale client still sending the old "tip + 25 c" total.
    const res = await POST(
      buildRequest(
        { staffId: '550e8400-e29b-41d4-a716-446655440001', amount: 525, tipAmount: 500, currency: 'EUR', nonce: 'nonce-fee-model-stale' },
        '10.0.0.7'
      )
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Amount mismatch');
  });
});
