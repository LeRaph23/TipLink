import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { type PackId } from '@/lib/env';
import { getPackPricing } from '@/lib/mangopay/pricing';
import { computePackTax } from '@/lib/mangopay/vat';
import { resolvePromoCode, discountFor } from '@/lib/billing/promo';
import { createServiceClient } from '@/lib/supabase/service';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

export const runtime = 'nodejs';

// Recomputes the pack price breakdown for the checkout UI whenever the buyer
// changes pack, country, VAT id or promo code. Pure computation — there is no
// Mangopay PayIn until the card is submitted, so this only quotes a price.
// The pack PayIn routes recompute the same figures server-side at charge time;
// this endpoint is never the source of truth for the amount charged.

const BodySchema = z.object({
  pack: z.enum(['solo', 'duo']),
  country: z.string().regex(/^[A-Za-z]{2}$/),
  vatNumber: z.string().max(20).optional(),
  promoCode: z.string().max(64).optional(),
});

export async function POST(request: NextRequest) {
  const ip = getClientIp(request.headers);
  const rl = await rateLimit(`pack-tax:${ip}`, { limit: 30, windowMs: 60_000 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    );
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Missing or invalid parameters' }, { status: 400 });
  }
  const { pack, country, vatNumber, promoCode } = parsed.data;

  const pricing = await getPackPricing(pack as PackId);
  const baseAmount = pricing.unitAmount;

  const supabase = createServiceClient();
  const promo = await resolvePromoCode(supabase, promoCode);
  const discountAmount = promo ? discountFor(baseAmount, promo.percentageOff) : 0;

  const htAmount = Math.max(0, baseAmount - discountAmount);
  const tax = computePackTax({ htAmount, country, vatNumber });

  return NextResponse.json({
    baseAmount,
    discountAmount,
    htAmount: tax.htAmount,
    taxAmount: tax.taxAmount,
    totalAmount: tax.totalAmount,
    taxRatePercent: tax.taxRatePercent,
    promoCode: promo?.code ?? null,
  });
}
