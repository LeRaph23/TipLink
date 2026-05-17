import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe/client';
import { computePackTax } from '@/lib/stripe/tax';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

export const runtime = 'nodejs';

// Recomputes VAT for the embedded /checkout flow whenever the customer's
// shipping country changes, and updates the PaymentIntent amount so the
// actual charge is HT + VAT. Pack prices are stored excl. VAT.
//
// Auth mirrors attach-pi-email: the clientSecret proves the caller owns the
// PaymentIntent. The endpoint refuses anything that is not one of our own
// pack-express PIs, and is rate-limited per IP.

export async function POST(request: NextRequest) {
  const ip = getClientIp(request.headers);
  const rl = await rateLimit(`pack-tax:${ip}`, { limit: 30, windowMs: 60_000 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    );
  }

  let body: { clientSecret?: unknown; country?: unknown; postalCode?: unknown; vatNumber?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (typeof body.clientSecret !== 'string' || !body.clientSecret.startsWith('pi_')) {
    return NextResponse.json({ error: 'Invalid clientSecret' }, { status: 400 });
  }
  if (typeof body.country !== 'string' || !/^[A-Za-z]{2}$/.test(body.country)) {
    return NextResponse.json({ error: 'Invalid country' }, { status: 400 });
  }
  const postalCode = typeof body.postalCode === 'string' ? body.postalCode.slice(0, 16) : null;
  const vatNumber = typeof body.vatNumber === 'string' ? body.vatNumber.slice(0, 20) : null;

  const piId = body.clientSecret.split('_secret_')[0];
  if (!piId.startsWith('pi_')) {
    return NextResponse.json({ error: 'Invalid clientSecret' }, { status: 400 });
  }

  try {
    const intent = await stripe.paymentIntents.retrieve(piId);
    if (intent.client_secret !== body.clientSecret) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (intent.metadata?.source !== 'pack-express') {
      return NextResponse.json({ error: 'Unsupported PI' }, { status: 400 });
    }
    if (intent.status === 'succeeded' || intent.status === 'processing') {
      return NextResponse.json({ error: 'Payment already in progress' }, { status: 409 });
    }

    // HT after promo discount — the canonical figures live in PI metadata,
    // written server-side by /api/billing/create-pack-intent.
    const baseAmount = parseInt(intent.metadata.base_amount ?? '0', 10);
    const discountAmount = parseInt(intent.metadata.discount_amount ?? '0', 10);
    const htAmount = Math.max(0, baseAmount - discountAmount);

    const tax = await computePackTax({
      htAmount,
      currency: intent.currency,
      country: body.country,
      postalCode,
      vatNumber,
    });

    await stripe.paymentIntents.update(piId, {
      amount: tax.totalAmount,
      metadata: {
        ...intent.metadata,
        ht_amount: String(tax.htAmount),
        tax_amount: String(tax.taxAmount),
        tax_country: tax.country,
        ...(vatNumber ? { vat_number: vatNumber } : {}),
      },
    });

    return NextResponse.json({
      htAmount: tax.htAmount,
      taxAmount: tax.taxAmount,
      totalAmount: tax.totalAmount,
      taxRatePercent: tax.taxRatePercent,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Stripe error';
    console.error('[pack-tax]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
