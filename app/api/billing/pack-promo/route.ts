import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe/client';
import { computePackTax, provisionalPackTax } from '@/lib/stripe/tax';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { createServiceClient } from '@/lib/supabase/service';
import { promoDiscount, resolvePromoCode } from '@/lib/billing/promo';

export const runtime = 'nodejs';

// Applies (or removes) a promo code on the /checkout PaymentIntent the buyer
// already has, instead of creating a new one.
//
// Applying a code used to create a fresh intent and remount the whole form:
// what the buyer had typed was wiped, a few tries hit create-pack-intent's
// rate limit ("Impossible d'initialiser le paiement"), and the "invalid code"
// message was cleared by the refetch that followed. Found by the end-to-end
// QA run.
//
// Auth mirrors pack-tax: the clientSecret proves the caller owns the intent,
// which must be one of our pack-express intents not yet being paid.

export async function POST(request: NextRequest) {
  const ip = getClientIp(request.headers);
  const rl = await rateLimit(`pack-promo:${ip}`, { limit: 20, windowMs: 60_000 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    );
  }

  let body: { clientSecret?: unknown; promoCode?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (typeof body.clientSecret !== 'string' || !body.clientSecret.startsWith('pi_')) {
    return NextResponse.json({ error: 'Invalid clientSecret' }, { status: 400 });
  }
  const rawCode = typeof body.promoCode === 'string' ? body.promoCode.trim() : '';
  const piId = body.clientSecret.split('_secret_')[0];

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

    const promo = rawCode ? await resolvePromoCode(createServiceClient(), rawCode) : null;
    if (rawCode && !promo) {
      return NextResponse.json({ error: 'Invalid promo code' }, { status: 400 });
    }

    const baseAmount = parseInt(intent.metadata.base_amount ?? '0', 10);
    const discountAmount = promoDiscount(baseAmount, promo);
    const htAmount = Math.max(0, baseAmount - discountAmount);

    // Keep the VAT basis the intent already had: the buyer's address once
    // pack-tax priced it, the provisional domestic rate before that.
    const tax = intent.metadata.tax_provisional === 'false' && intent.metadata.tax_country
      ? await computePackTax({
          htAmount,
          currency: intent.currency,
          country: intent.metadata.tax_country,
          vatNumber: intent.metadata.vat_number ?? null,
        })
      : { ...provisionalPackTax(htAmount), taxRatePercent: null };

    // Metadata keys cannot be deleted by omission; an empty string removes them.
    await stripe.paymentIntents.update(piId, {
      amount: tax.totalAmount,
      metadata: {
        discount_amount: String(discountAmount),
        ht_amount: String(tax.htAmount),
        tax_amount: String(tax.taxAmount),
        promo_code: promo?.code ?? '',
        promo_code_id: promo?.promo_code_id ?? '',
      },
    });

    return NextResponse.json({
      baseAmount,
      discountAmount,
      promoCode: promo?.code ?? null,
      htAmount: tax.htAmount,
      taxAmount: tax.taxAmount,
      totalAmount: tax.totalAmount,
      taxRatePercent: tax.taxRatePercent,
      taxProvisional: intent.metadata.tax_provisional !== 'false',
    });
  } catch (err) {
    console.error('[pack-promo]', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Stripe error' }, { status: 500 });
  }
}
