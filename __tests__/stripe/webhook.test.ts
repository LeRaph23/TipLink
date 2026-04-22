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
});
