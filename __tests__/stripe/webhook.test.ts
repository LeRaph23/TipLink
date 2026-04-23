/**
 * Stripe webhook handler unit tests.
 * Uses top-level vi.mock (required by Vitest hoisting).
 *
 * Run: npm test -- __tests__/stripe/webhook.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mocks must be at top level — Vitest hoists them before test execution
vi.mock('@/lib/stripe/client', () => ({
  stripe: {
    webhooks: {
      constructEvent: vi.fn(),
    },
  },
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(),
}));

describe('Stripe Webhook Handler', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.STRIPE_SECRET_KEY = 'sk_test_mock';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_mock';
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role';
  });

  it('returns 400 when stripe-signature header is missing', async () => {
    const { POST } = await import('@/app/api/webhooks/stripe/route');
    const request = new NextRequest('https://test.example.com/api/webhooks/stripe', {
      method: 'POST',
      body: '{}',
      // No stripe-signature header
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('stripe-signature');
  });

  it('returns 400 when webhook signature is invalid', async () => {
    const { stripe } = await import('@/lib/stripe/client');
    vi.mocked(stripe.webhooks.constructEvent).mockImplementation(() => {
      throw new Error('No signatures found matching the expected signature');
    });

    const { POST } = await import('@/app/api/webhooks/stripe/route');
    const request = new NextRequest('https://test.example.com/api/webhooks/stripe', {
      method: 'POST',
      body: 'invalid-body',
      headers: { 'stripe-signature': 'invalid-sig' },
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it('returns 200 and skips handler for already-processed events (idempotency)', async () => {
    const mockEvent = {
      id: 'evt_test_already_processed',
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_test_123', metadata: {} } },
    };

    const { stripe } = await import('@/lib/stripe/client');
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(mockEvent as never);

    const { createServiceClient } = await import('@/lib/supabase/service');
    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          // Already processed — processed_at is set
          data: { id: 'log-uuid', processed_at: '2024-01-01T00:00:00Z' },
          error: null,
        }),
        upsert: vi.fn().mockResolvedValue({ error: null }),
        update: vi.fn().mockReturnThis(),
      }),
    };
    vi.mocked(createServiceClient).mockReturnValue(mockSupabase as never);

    const { POST } = await import('@/app/api/webhooks/stripe/route');
    const request = new NextRequest('https://test.example.com/api/webhooks/stripe', {
      method: 'POST',
      body: JSON.stringify(mockEvent),
      headers: { 'stripe-signature': 'valid-sig' },
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.received).toBe(true);
  });

  it('payment_intent.succeeded flips transaction to succeeded', async () => {
    const mockEvent = {
      id: 'evt_pi_ok',
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_test_123',
          status: 'succeeded',
          metadata: { transaction_id: 'txn-uuid-1' },
        },
      },
    };

    const { stripe } = await import('@/lib/stripe/client');
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(mockEvent as never);

    const { createServiceClient } = await import('@/lib/supabase/service');
    const txnUpdateEqChain = {
      eq: vi.fn().mockReturnThis(),
    };
    const updateFn = vi.fn().mockReturnValue(txnUpdateEqChain);

    const fromCalls: string[] = [];
    const mockSupabase = {
      from: vi.fn((table: string) => {
        fromCalls.push(table);
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
          upsert: vi.fn().mockResolvedValue({ error: null }),
          update: updateFn,
        };
      }),
    };
    vi.mocked(createServiceClient).mockReturnValue(mockSupabase as never);

    const { POST } = await import('@/app/api/webhooks/stripe/route');
    const res = await POST(
      new NextRequest('https://test.example.com/api/webhooks/stripe', {
        method: 'POST',
        body: JSON.stringify(mockEvent),
        headers: { 'stripe-signature': 'valid-sig' },
      })
    );

    expect(res.status).toBe(200);
    expect(fromCalls).toContain('transactions');
    expect(updateFn).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'succeeded',
        stripe_payment_intent_id: 'pi_test_123',
      })
    );
  });

  it('payment_intent.succeeded with non-succeeded status is a no-op on transactions', async () => {
    const mockEvent = {
      id: 'evt_pi_processing',
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_test_processing',
          status: 'processing',
          metadata: { transaction_id: 'txn-uuid-2' },
        },
      },
    };

    const { stripe } = await import('@/lib/stripe/client');
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(mockEvent as never);

    const { createServiceClient } = await import('@/lib/supabase/service');
    const updateFn = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnThis() });

    const mockSupabase = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
        upsert: vi.fn().mockResolvedValue({ error: null }),
        update: updateFn,
      })),
    };
    vi.mocked(createServiceClient).mockReturnValue(mockSupabase as never);

    const { POST } = await import('@/app/api/webhooks/stripe/route');
    const res = await POST(
      new NextRequest('https://test.example.com/api/webhooks/stripe', {
        method: 'POST',
        body: JSON.stringify(mockEvent),
        headers: { 'stripe-signature': 'valid-sig' },
      })
    );

    expect(res.status).toBe(200);
    // No call should mark the transaction as succeeded
    const succeededCall = updateFn.mock.calls.find(
      ([arg]) => (arg as { status?: string }).status === 'succeeded'
    );
    expect(succeededCall).toBeUndefined();
  });

  it('payment_intent.payment_failed marks transaction as failed', async () => {
    const mockEvent = {
      id: 'evt_pi_failed',
      type: 'payment_intent.payment_failed',
      data: {
        object: {
          id: 'pi_test_failed',
          metadata: { transaction_id: 'txn-uuid-3' },
        },
      },
    };

    const { stripe } = await import('@/lib/stripe/client');
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(mockEvent as never);

    const { createServiceClient } = await import('@/lib/supabase/service');
    const updateFn = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnThis() });
    const mockSupabase = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
        upsert: vi.fn().mockResolvedValue({ error: null }),
        update: updateFn,
      })),
    };
    vi.mocked(createServiceClient).mockReturnValue(mockSupabase as never);

    const { POST } = await import('@/app/api/webhooks/stripe/route');
    await POST(
      new NextRequest('https://test.example.com/api/webhooks/stripe', {
        method: 'POST',
        body: JSON.stringify(mockEvent),
        headers: { 'stripe-signature': 'valid-sig' },
      })
    );

    expect(updateFn).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed' })
    );
  });

  it('charge.refunded marks transaction as refunded', async () => {
    const mockEvent = {
      id: 'evt_charge_refunded',
      type: 'charge.refunded',
      data: {
        object: {
          id: 'ch_test_1',
          payment_intent: 'pi_test_refund',
        },
      },
    };

    const { stripe } = await import('@/lib/stripe/client');
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(mockEvent as never);

    const { createServiceClient } = await import('@/lib/supabase/service');
    const updateFn = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnThis() });
    const mockSupabase = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
        upsert: vi.fn().mockResolvedValue({ error: null }),
        update: updateFn,
      })),
    };
    vi.mocked(createServiceClient).mockReturnValue(mockSupabase as never);

    const { POST } = await import('@/app/api/webhooks/stripe/route');
    await POST(
      new NextRequest('https://test.example.com/api/webhooks/stripe', {
        method: 'POST',
        body: JSON.stringify(mockEvent),
        headers: { 'stripe-signature': 'valid-sig' },
      })
    );

    expect(updateFn).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'refunded' })
    );
  });

  it('logs event to webhook_events before processing', async () => {
    const mockEvent = {
      id: 'evt_test_new',
      type: 'account.updated',
      data: { object: { id: 'acct_test', details_submitted: false, charges_enabled: false } },
    };

    const { stripe } = await import('@/lib/stripe/client');
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(mockEvent as never);

    const { createServiceClient } = await import('@/lib/supabase/service');
    const upsertMock = vi.fn().mockResolvedValue({ error: null });
    const updateMock = vi.fn().mockReturnThis();
    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }), // Not yet processed
        upsert: upsertMock,
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      }),
    };
    vi.mocked(createServiceClient).mockReturnValue(mockSupabase as never);

    const { POST } = await import('@/app/api/webhooks/stripe/route');
    await POST(
      new NextRequest('https://test.example.com/api/webhooks/stripe', {
        method: 'POST',
        body: JSON.stringify(mockEvent),
        headers: { 'stripe-signature': 'valid-sig' },
      })
    );

    // Verify event was logged to webhook_events table
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ stripe_event_id: 'evt_test_new' }),
      expect.objectContaining({ onConflict: 'stripe_event_id' })
    );
  });

  // ============================================================
  // SmartTag subscription lifecycle tests
  // ============================================================

  it('checkout.session.completed updates group + creates smarttag_orders row', async () => {
    const mockEvent = {
      id: 'evt_cs_done',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_smarttag',
          mode: 'subscription',
          subscription: 'sub_123',
          customer: 'cus_123',
          metadata: { group_id: 'grp-1', pack: 'm', quantity: '30' },
          collected_information: {
            shipping_details: {
              name: 'Acme Corp',
              address: { line1: '1 rue', city: 'Paris', postal_code: '75001', country: 'FR' },
            },
          },
        },
      },
    };

    const { stripe } = await import('@/lib/stripe/client');
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(mockEvent as never);

    const { createServiceClient } = await import('@/lib/supabase/service');
    const groupUpdate = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
    const orderUpsert = vi.fn().mockResolvedValue({ error: null });

    const mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === 'groups') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
            upsert: vi.fn().mockResolvedValue({ error: null }),
            update: groupUpdate,
          };
        }
        if (table === 'smarttag_orders') {
          return { upsert: orderUpsert };
        }
        // webhook_events
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
          upsert: vi.fn().mockResolvedValue({ error: null }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        };
      }),
    };
    vi.mocked(createServiceClient).mockReturnValue(mockSupabase as never);

    const { POST } = await import('@/app/api/webhooks/stripe/route');
    const res = await POST(
      new NextRequest('https://test.example.com/api/webhooks/stripe', {
        method: 'POST',
        body: JSON.stringify(mockEvent),
        headers: { 'stripe-signature': 'valid-sig' },
      })
    );

    expect(res.status).toBe(200);
    expect(groupUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        stripe_customer_id: 'cus_123',
        subscription_id: 'sub_123',
        subscription_status: 'active',
        subscription_pack: 'm',
      })
    );
    expect(orderUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        group_id: 'grp-1',
        pack: 'm',
        quantity: 30,
        stripe_checkout_session_id: 'cs_test_smarttag',
        status: 'pending_fulfillment',
      }),
      expect.objectContaining({ onConflict: 'stripe_checkout_session_id' })
    );
  });

  it('checkout.session.completed ignores non-subscription mode', async () => {
    const mockEvent = {
      id: 'evt_cs_payment',
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_pay', mode: 'payment', metadata: {} } },
    };

    const { stripe } = await import('@/lib/stripe/client');
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(mockEvent as never);

    const { createServiceClient } = await import('@/lib/supabase/service');
    const orderUpsert = vi.fn();
    const mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === 'smarttag_orders') return { upsert: orderUpsert };
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
          upsert: vi.fn().mockResolvedValue({ error: null }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        };
      }),
    };
    vi.mocked(createServiceClient).mockReturnValue(mockSupabase as never);

    const { POST } = await import('@/app/api/webhooks/stripe/route');
    await POST(
      new NextRequest('https://test.example.com/api/webhooks/stripe', {
        method: 'POST',
        body: JSON.stringify(mockEvent),
        headers: { 'stripe-signature': 'valid-sig' },
      })
    );

    expect(orderUpsert).not.toHaveBeenCalled();
  });

  it('customer.subscription.updated propagates status to groups', async () => {
    const mockEvent = {
      id: 'evt_sub_updated',
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_123',
          status: 'active',
          customer: 'cus_123',
          metadata: { group_id: 'grp-1' },
        },
      },
    };

    const { stripe } = await import('@/lib/stripe/client');
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(mockEvent as never);

    const { createServiceClient } = await import('@/lib/supabase/service');
    const groupUpdate = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
    const mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === 'groups') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
            upsert: vi.fn().mockResolvedValue({ error: null }),
            update: groupUpdate,
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
          upsert: vi.fn().mockResolvedValue({ error: null }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        };
      }),
    };
    vi.mocked(createServiceClient).mockReturnValue(mockSupabase as never);

    const { POST } = await import('@/app/api/webhooks/stripe/route');
    await POST(
      new NextRequest('https://test.example.com/api/webhooks/stripe', {
        method: 'POST',
        body: JSON.stringify(mockEvent),
        headers: { 'stripe-signature': 'valid-sig' },
      })
    );

    expect(groupUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        subscription_status: 'active',
        subscription_id: 'sub_123',
      })
    );
  });

  it('invoice.payment_failed marks group subscription as past_due', async () => {
    const mockEvent = {
      id: 'evt_invoice_failed',
      type: 'invoice.payment_failed',
      data: { object: { id: 'in_1', customer: 'cus_456' } },
    };

    const { stripe } = await import('@/lib/stripe/client');
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(mockEvent as never);

    const { createServiceClient } = await import('@/lib/supabase/service');
    const groupUpdate = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
    const mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === 'groups') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
            upsert: vi.fn().mockResolvedValue({ error: null }),
            update: groupUpdate,
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
          upsert: vi.fn().mockResolvedValue({ error: null }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        };
      }),
    };
    vi.mocked(createServiceClient).mockReturnValue(mockSupabase as never);

    const { POST } = await import('@/app/api/webhooks/stripe/route');
    await POST(
      new NextRequest('https://test.example.com/api/webhooks/stripe', {
        method: 'POST',
        body: JSON.stringify(mockEvent),
        headers: { 'stripe-signature': 'valid-sig' },
      })
    );

    expect(groupUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ subscription_status: 'past_due' })
    );
  });
});
