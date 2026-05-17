import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe/client';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { PACKS, type PackId } from '@/lib/env';
import { getPackPricing } from '@/lib/stripe/pricing';
import { computePackTax } from '@/lib/stripe/tax';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

export const runtime = 'nodejs';

type Address = {
  line1: string;
  line2?: string | null;
  city: string;
  postal_code: string;
  country: string;
};

type Body = {
  pack: PackId;
  locale?: string;
  promoCode?: string | null;
  business?: {
    legal_name: string;
    vat_number?: string | null;
    shipping: Address;
    billing_same_as_shipping?: boolean;
    billing?: Address;
  };
};

function isValidPack(p: unknown): p is PackId {
  return p === 'solo' || p === 'duo';
}

export async function POST(request: NextRequest) {
  // Rate limit: 5 checkouts / 60s / IP
  const ip = getClientIp(request.headers);
  const rl = await rateLimit(`billing-checkout:${ip}`, { limit: 5, windowMs: 60_000 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    );
  }

  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!isValidPack(body.pack)) {
    return NextResponse.json({ error: 'Invalid pack' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const service = createServiceClient();

  // Find or create the billing group for this user.
  // A user's first paid checkout creates a group they own (group_admin).
  const { data: existingRoles } = await service
    .from('user_roles')
    .select('group_id')
    .eq('user_id', user.id)
    .in('role', ['group_admin', 'super_admin'])
    .not('group_id', 'is', null);

  let groupId: string | null = existingRoles?.[0]?.group_id ?? null;

  const biz = body.business;

  if (!groupId) {
    if (!biz || !biz.legal_name || !biz.shipping) {
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
        shipping_address: biz.shipping,
        billing_address: biz.billing_same_as_shipping ? biz.shipping : (biz.billing ?? biz.shipping),
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
      return NextResponse.json(
        { error: `Failed to assign role: ${roleError.message}` },
        { status: 500 }
      );
    }
  } else if (biz) {
    // Update group with latest business details (address may change)
    await service
      .from('groups')
      .update({
        legal_name: biz.legal_name,
        vat_number: biz.vat_number ?? null,
        shipping_address: biz.shipping,
        billing_address: biz.billing_same_as_shipping ? biz.shipping : (biz.billing ?? biz.shipping),
      })
      .eq('id', groupId);
  }

  // Load fresh group state
  const { data: group } = await service
    .from('groups')
    .select('id, legal_name, vat_number, stripe_customer_id, shipping_address')
    .eq('id', groupId)
    .single();

  if (!group) {
    return NextResponse.json({ error: 'Group not found' }, { status: 500 });
  }

  // Create Stripe customer if not yet
  let stripeCustomerId = group.stripe_customer_id;
  if (!stripeCustomerId) {
    const customer = await stripe.customers.create({
      email: user.email ?? undefined,
      name: group.legal_name ?? undefined,
      metadata: { group_id: group.id },
      ...(group.vat_number
        ? {
            tax_id_data: [{ type: 'eu_vat', value: group.vat_number }],
          }
        : {}),
    });
    stripeCustomerId = customer.id;
    await service
      .from('groups')
      .update({ stripe_customer_id: stripeCustomerId })
      .eq('id', group.id);
  }

  const pack = PACKS[body.pack];
  const locale = body.locale === 'fr' ? 'fr' : 'en';
  const pricing = await getPackPricing(body.pack);
  const baseAmount = pricing.unitAmount;

  if (!biz?.shipping?.country) {
    return NextResponse.json({ error: 'Shipping address required' }, { status: 400 });
  }

  // Resolve promo code to a percentage discount.
  let promoCodeStr: string | null = null;
  let promoCodeId: string | null = null;
  let discountAmount = 0;
  if (body.promoCode) {
    const code = body.promoCode.toUpperCase().trim();
    const { data: promoRow } = await service
      .from('promo_codes')
      .select('id, percentage_off, is_active, expires_at, max_redemptions, times_redeemed')
      .eq('code', code)
      .maybeSingle();
    if (promoRow?.is_active) {
      const expired = promoRow.expires_at ? new Date(promoRow.expires_at) < new Date() : false;
      const exhausted = promoRow.max_redemptions !== null && promoRow.times_redeemed >= promoRow.max_redemptions;
      if (!expired && !exhausted) {
        promoCodeStr = code;
        promoCodeId = promoRow.id;
        discountAmount = Math.floor((baseAmount * promoRow.percentage_off) / 100);
      }
    }
  }

  const htAmount = Math.max(0, baseAmount - discountAmount);

  // VAT — pack prices are stored excl. VAT; Stripe Tax resolves the rate from
  // the shipping country (and applies reverse-charge for valid EU VAT ids).
  const tax = await computePackTax({
    htAmount,
    currency: pricing.currency,
    country: biz.shipping.country,
    vatNumber: group.vat_number,
  });

  // Persist the billing address on the Stripe customer so the invoice's
  // automatic_tax can compute VAT.
  const billingAddr = biz.billing_same_as_shipping ? biz.shipping : (biz.billing ?? biz.shipping);
  try {
    await stripe.customers.update(stripeCustomerId, {
      address: {
        line1: billingAddr.line1,
        line2: billingAddr.line2 ?? undefined,
        city: billingAddr.city,
        postal_code: billingAddr.postal_code,
        country: billingAddr.country,
      },
    });
  } catch { /* non-blocking */ }

  // One-shot hardware purchase, paid in-page via Stripe Elements. Ongoing
  // revenue comes from per-tip commission (groups.platform_fee_bps).
  const intent = await stripe.paymentIntents.create({
    amount: tax.totalAmount,
    currency: pricing.currency,
    customer: stripeCustomerId,
    automatic_payment_methods: { enabled: true },
    description: pricing.productName,
    shipping: {
      name: group.legal_name ?? biz.legal_name,
      address: {
        line1: biz.shipping.line1,
        line2: biz.shipping.line2 ?? undefined,
        city: biz.shipping.city,
        postal_code: biz.shipping.postal_code,
        country: biz.shipping.country,
      },
    },
    metadata: {
      source: 'pack-order',
      group_id: group.id,
      pack: body.pack,
      quantity: String(pack.quantity),
      user_id: user.id,
      locale,
      base_amount: String(baseAmount),
      discount_amount: String(discountAmount),
      ht_amount: String(htAmount),
      tax_amount: String(tax.taxAmount),
      tax_country: tax.country,
      ...(promoCodeStr ? { promo_code: promoCodeStr } : {}),
      ...(promoCodeId ? { promo_code_id: promoCodeId } : {}),
    },
  });

  return NextResponse.json({
    clientSecret: intent.client_secret,
    amount: tax.totalAmount,
    htAmount,
    taxAmount: tax.taxAmount,
    taxRatePercent: tax.taxRatePercent,
    discountAmount,
    promoCode: promoCodeStr,
  });
}
