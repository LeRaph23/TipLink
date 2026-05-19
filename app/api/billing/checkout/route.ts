import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { PACKS, type PackId } from '@/lib/env';
import { getPackPricing } from '@/lib/mangopay/pricing';
import { computePackTax } from '@/lib/mangopay/vat';
import { resolvePromoCode, discountFor } from '@/lib/billing/promo';
import { generateIdempotencyKey } from '@/lib/mangopay/idempotency';
import { createDirectCardPayIn, getPayIn } from '@/lib/mangopay/payins';
import { platformIds } from '@/lib/mangopay/client';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import type { Json } from '@/types/database';

export const runtime = 'nodejs';

// Serves the Checkout SDK's `onCreatePayment` callback for an authenticated
// SmartTag pack order from the /order wizard. The buyer's billing group is
// found or created from the submitted business details, then the pack PayIn
// credits the central wallet. The webhook turns the stored context into a
// smarttag_order once the PayIn succeeds.

const AddressSchema = z.object({
  line1: z.string().trim().min(1).max(200),
  line2: z.string().trim().max(200).nullish(),
  city: z.string().trim().min(1).max(120),
  postal_code: z.string().trim().min(1).max(20),
  country: z.string().regex(/^[A-Za-z]{2}$/),
});

const BusinessSchema = z.object({
  legal_name: z.string().trim().min(1).max(200),
  vat_number: z.string().trim().max(20).nullish(),
  shipping: AddressSchema,
  billing_same_as_shipping: z.boolean().optional(),
  billing: AddressSchema.optional(),
});

const BodySchema = z.object({
  pack: z.enum(['solo', 'duo']),
  locale: z.string().max(8).optional(),
  promoCode: z.string().max(64).optional(),
  nonce: z.string().min(8).max(128),
  cardId: z.string().min(1).max(64),
  mangopayUserId: z.string().min(1).max(64),
  business: BusinessSchema.optional(),
});

export async function POST(request: NextRequest) {
  const ip = getClientIp(request.headers);
  const rl = await rateLimit(`billing-checkout:${ip}`, { limit: 5, windowMs: 60_000 });
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
  const { pack, promoCode, nonce, cardId, mangopayUserId, business: biz } = parsed.data;
  const locale = parsed.data.locale === 'fr' ? 'fr' : 'en';

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const service = createServiceClient();

  // Find or create the billing group. A user's first paid checkout creates a
  // group they own (group_admin).
  const { data: existingRoles } = await service
    .from('user_roles')
    .select('group_id')
    .eq('user_id', user.id)
    .in('role', ['group_admin', 'super_admin'])
    .not('group_id', 'is', null);

  let groupId: string | null = existingRoles?.[0]?.group_id ?? null;

  const billingAddr = biz
    ? (biz.billing_same_as_shipping ? biz.shipping : (biz.billing ?? biz.shipping))
    : null;

  if (!groupId) {
    if (!biz) {
      return NextResponse.json(
        { error: 'Business details required for first order' },
        { status: 400 }
      );
    }
    const { data: newGroup, error: groupError } = await service
      .from('groups')
      .insert({
        name: biz.legal_name,
        legal_name: biz.legal_name,
        vat_number: biz.vat_number ?? null,
        shipping_address: biz.shipping as unknown as Json,
        billing_address: billingAddr as unknown as Json,
        settings: { tip_thresholds: [1, 2, 5, 10] },
      })
      .select('id')
      .single();

    if (groupError || !newGroup) {
      return NextResponse.json(
        { error: `Failed to create billing group: ${groupError?.message ?? 'unknown'}` },
        { status: 500 }
      );
    }
    groupId = newGroup.id;

    const { error: roleError } = await service.from('user_roles').insert({
      user_id: user.id,
      role: 'group_admin',
      group_id: groupId,
    });
    if (roleError) {
      return NextResponse.json({ error: `Failed to assign role: ${roleError.message}` }, { status: 500 });
    }
  } else if (biz) {
    await service
      .from('groups')
      .update({
        legal_name: biz.legal_name,
        vat_number: biz.vat_number ?? null,
        shipping_address: biz.shipping as unknown as Json,
        billing_address: billingAddr as unknown as Json,
      })
      .eq('id', groupId);
  }

  const { data: group } = await service
    .from('groups')
    .select('id, legal_name, vat_number, shipping_address')
    .eq('id', groupId)
    .single();

  if (!group) {
    return NextResponse.json({ error: 'Group not found' }, { status: 500 });
  }

  // Shipping country drives VAT; fall back to the group's stored address for a
  // repeat order that doesn't re-send business details.
  const storedShipping = (group.shipping_address ?? null) as { country?: string } | null;
  const shippingCountry = biz?.shipping.country ?? storedShipping?.country ?? null;
  if (!shippingCountry) {
    return NextResponse.json({ error: 'Shipping address required' }, { status: 400 });
  }

  const pricing = await getPackPricing(pack as PackId);
  const baseAmount = pricing.unitAmount;

  const promo = await resolvePromoCode(service, promoCode);
  const discountAmount = promo ? discountFor(baseAmount, promo.percentageOff) : 0;
  const htAmount = Math.max(0, baseAmount - discountAmount);
  const tax = computePackTax({
    htAmount,
    country: shippingCountry,
    vatNumber: group.vat_number,
  });

  const idempotencyKey = generateIdempotencyKey({
    scope: `pack-order:${groupId}`,
    amount: tax.totalAmount,
    nonce,
  });

  const context = {
    pack,
    quantity: PACKS[pack as PackId].quantity,
    group_id: group.id,
    user_id: user.id,
    legal_name: group.legal_name,
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
    customer_email: user.email ?? null,
    shipping: biz?.shipping ?? storedShipping,
  };

  const { data: ctx, error: ctxError } = await service
    .from('payin_contexts')
    .insert({
      idempotency_key: idempotencyKey,
      source: 'pack-order',
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
    const { data: existing } = await service
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
      tag: `pack-order:${contextId}`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Mangopay error';
    console.error('[billing/checkout]', message);
    return NextResponse.json({ error: 'Failed to create payment' }, { status: 502 });
  }

  await service
    .from('payin_contexts')
    .update({ mangopay_payin_id: payIn.Id })
    .eq('id', contextId);

  return NextResponse.json(payIn);
}
