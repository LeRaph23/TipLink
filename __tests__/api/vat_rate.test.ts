/**
 * /api/billing/vat-rate gives /checkout the rate Stripe Tax applies to a
 * delivery country before the address is complete. It must only ever price
 * countries we ship to, and reuse one cached answer per country, since every
 * Stripe Tax calculation is billed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));
// No Next cache in unit tests: call straight through.
vi.mock('next/cache', () => ({
  unstable_cache: (fn: (...a: unknown[]) => unknown) => fn,
}));
vi.mock('@/lib/stripe/tax', () => ({ computePackTax: vi.fn() }));

import { computePackTax } from '@/lib/stripe/tax';
import { GET } from '@/app/api/billing/vat-rate/route';

function request(country: string) {
  return new NextRequest(`https://test.example.com/api/billing/vat-rate?country=${country}`);
}

describe('GET /api/billing/vat-rate', () => {
  beforeEach(() => {
    vi.mocked(computePackTax).mockReset();
  });

  it('returns the rate Stripe Tax gives the country', async () => {
    vi.mocked(computePackTax).mockResolvedValue({
      htAmount: 10_000, taxAmount: 2000, totalAmount: 12_000, taxRatePercent: 20, country: 'DE', calculationId: null,
    });
    const res = await GET(request('de'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ country: 'DE', ratePercent: 20 });
    expect(computePackTax).toHaveBeenCalledWith({ htAmount: 10_000, currency: 'eur', country: 'DE' });
  });

  it('refuses a country we do not ship to, without calling Stripe', async () => {
    const res = await GET(request('US'));
    expect(res.status).toBe(400);
    expect(computePackTax).not.toHaveBeenCalled();
  });

  it('answers 502 when Stripe Tax fails', async () => {
    vi.mocked(computePackTax).mockRejectedValue(new Error('stripe down'));
    const res = await GET(request('FR'));
    expect(res.status).toBe(502);
  });
});
