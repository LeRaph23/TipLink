import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { PACKS, type PackId } from '@/lib/env';
import { getPackPricing } from '@/lib/mangopay/pricing';
import { computePackTax } from '@/lib/mangopay/vat';
import { resolvePromoCode, discountFor } from '@/lib/billing/promo';
import { generateIdempotencyKey } from '@/lib/mangopay/idempotency';
import { createDirectCardPayIn, getPayIn } from '@/lib/mangopay/payins';
import { platformIds } from '@/lib/mangopay/client';
import { createServiceClient } from '@/lib/supabase/service';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import type { Json } from '@/types/database';

export const runtime = 'nodejs';

// Serves the Checkout SDK's `onCreatePayment` callback for the guest ("express")
// SmartTag pack purchase on /checkout. There is no billing group yet — the
// webhook creates the group, order and establishment from the stored context
// once the PayIn succeeds.

const AddressSchema = z.object({
  name: z.string().trim().min(1).max(200),
  line1: z.string().trim().min(1).max(200),
  line2: z.string().trim().max(200).optional(),
  city: z.string().trim().min(1).max(120),
  postal_code: z.string().trim().min(1).max(20),
  country: z.string().regex(/^[A-Za-z]{2}$/),
});

const BodySchema = z.object({
  pack: z.enum(['solo', 'duo']),
  locale: z.string().max(8).optional(),
  promoCode: z.string().max(64).optional(),
  vatNumber: z.string().max(20).optional(),
  nonce: z.string().min(8).max(128),
  cardId: z.string().min(1).max(64),
  mangopayUserId: z.string().min(1).max(64),
  customerEmail: z.string().email().max(255).optional(),
  shipping: AddressSchema,
});

export async function POST(request: NextRequest) {
  const ip = getClientIp(request.headers);
  const rl = await rateLimit(`create-pack-intent:${ip}`, { limit: 5, windowMs: 60_000 });
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
  const { pack, promoCode, vatNumber, nonce, cardId, mangopayUserId, customerEmail, shipping } = parsed.data;
  const locale = parsed.data.locale === 'fr' ? 'fr' : 'en';

  const supabase = createServiceClient();

  const pricing = await getPackPricing(pack as PackId);
  const baseAmount = pricing.unitAmount;

  const promo = await resolvePromoCode(supabase, promoCode);
  const discountAmount = promo ? discountFor(baseAmount, promo.percentageOff) : 0;
  const htAmount = Math.max(0, baseAmount - discountAmount);
  const tax = computePackTax({ htAmount, country: shipping.country, vatNumber });

  const idempotencyKey = generateIdempotencyKey({
    scope: `pack-express:${pack}`,
    amount: tax.totalAmount,
    nonce,
  });

  const context = {
    pack,
    quantity: PACKS[pack as PackId].quantity,
    locale,
    base_amount: baseAmount,
    discount_amount: discountAmount,
    ht_amount: tax.htAmount,
    tax_amount: tax.taxAmount,
    total_amount: tax.totalAmount,
    tax_country: tax.country,
    tax_rate_percent: tax.taxRatePercent,
    promo_code: promo?.code ?? null,
    promo_code_id: promo?.promoCodeId ?? null,
    customer_email: customerEmail ?? null,
    vat_number: vatNumber ?? null,
    shipping,
  };

  const { data: ctx, error: ctxError } = await supabase
    .from('payin_contexts')
    .insert({
      idempotency_key: idempotencyKey,
      source: 'pack-express',
      status: 'pending',
      context: context as Json,
    })
    .select('id, mangopay_payin_id')
    .single();

  let contextId: string;

  if (ctxError) {
    if (ctxError.code !== '23505') {
      return NextResponse.json({ error: 'Failed to record payment context' }, { status: 500 });
    }
    const { data: existing } = await supabase
      .from('payin_contexts')
      .select('id, mangopay_payin_id')
      .eq('idempotency_key', idempotencyKey)
      .single();
    if (!existing) {
      return NextResponse.json({ error: 'Payment context lookup failed' }, { status: 500 });
    }
    if (existing.mangopay_payin_id) {
      try {
        const payIn = await getPayIn(existing.mangopay_payin_id);
        return NextResponse.json(payIn);
      } catch {
        return NextResponse.json({ error: 'Failed to load existing payment' }, { status: 502 });
      }
    }
    contextId = existing.id;
  } else {
    contextId = ctx!.id;
  }

  const { walletId } = platformIds();

  let payIn;
  try {
    payIn = await createDirectCardPayIn({
      authorId: mangopayUserId,
      creditedWalletId: walletId,
      cardId,
      debitedFunds: tax.totalAmount,
      idempotencyKey,
      statementDescriptor: 'TipLink',
      ...(ip !== 'unknown' ? { ipAddress: ip } : {}),
      tag: `pack-express:${contextId}`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Mangopay error';
    console.error('[create-pack-intent]', message);
    return NextResponse.json({ error: 'Failed to create payment' }, { status: 502 });
  }

  await supabase
    .from('payin_contexts')
    .update({ mangopay_payin_id: payIn.Id })
    .eq('id', contextId);

  return NextResponse.json(payIn);
}
