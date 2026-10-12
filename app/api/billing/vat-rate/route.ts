import { NextRequest, NextResponse } from 'next/server';
import { countryVatRatePercent } from '@/lib/stripe/vat-rate';
import { isShippingCountry } from '@/lib/billing/shipping-countries';

export const runtime = 'nodejs';

// GET /api/billing/vat-rate?country=DE → { country, ratePercent }
// The rate /checkout shows for a delivery country before the address is
// complete. Only countries we ship to, and cached per country (see
// lib/stripe/vat-rate.ts), so it cannot be used to run up Stripe Tax calls.
export async function GET(request: NextRequest) {
  const country = request.nextUrl.searchParams.get('country')?.toUpperCase() ?? '';
  if (!isShippingCountry(country)) {
    return NextResponse.json({ error: 'Invalid country' }, { status: 400 });
  }
  try {
    const ratePercent = await countryVatRatePercent(country);
    return NextResponse.json(
      { country, ratePercent },
      { headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800' } },
    );
  } catch (err) {
    console.error('[vat-rate]', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Rate unavailable' }, { status: 502 });
  }
}
