import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe/client';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getBaseUrl, getPackPrices, PACKS, type PackId } from '@/lib/env';
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
  business?: {
    legal_name: string;
    vat_number?: string | null;
    shipping: Address;
    billing_same_as_shipping?: boolean;
    billing?: Address;
  };
};

const ALLOWED_SHIPPING_COUNTRIES = [
  'FR', 'BE', 'IE', 'ES', 'DE', 'IT', 'NL', 'LU', 'PT', 'AT', 'FI', 'GR',
] as const;

function isValidPack(p: unknown): p is PackId {
  return p === 's' || p === 'm' || p === 'l';
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

  const prices = getPackPrices(body.pack);
  const pack = PACKS[body.pack];
  const base = getBaseUrl();
  const locale = body.locale === 'fr' ? 'fr' : 'en';

  // One-shot hardware purchase. Ongoing revenue comes from
  // per-tip commission (groups.platform_fee_bps), not from subscription.
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer: stripeCustomerId,
    line_items: [
      { price: prices.hardware, quantity: 1 },
    ],
    payment_intent_data: {
      metadata: {
        group_id: group.id,
        pack: body.pack,
        quantity: String(pack.quantity),
      },
    },
    invoice_creation: { enabled: true },
    automatic_tax: { enabled: true },
    tax_id_collection: { enabled: true },
    customer_update: {
      address: 'auto',
      shipping: 'auto',
      name: 'auto',
    },
    billing_address_collection: 'required',
    shipping_address_collection: {
      allowed_countries: [...ALLOWED_SHIPPING_COUNTRIES],
    },
    allow_promotion_codes: true,
    success_url: `${base}/${locale}/dashboard/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}/${locale}/pricing`,
    metadata: {
      group_id: group.id,
      pack: body.pack,
      quantity: String(pack.quantity),
      user_id: user.id,
    },
  });

  return NextResponse.json({ url: session.url, sessionId: session.id });
}
