import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe/client';
import { getBaseUrl, PACKS, type PackId } from '@/lib/env';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

export const runtime = 'nodejs';

const ALLOWED_SHIPPING_COUNTRIES = [
  'FR', 'BE', 'IE', 'ES', 'DE', 'IT', 'NL', 'LU', 'PT', 'AT', 'FI', 'GR',
] as const;

function isValidPack(p: unknown): p is PackId {
  return p === 'solo' || p === 'duo';
}

function getLineItem(pack: PackId) {
  const packDef = PACKS[pack];
  const priceId = process.env[`STRIPE_PRICE_PACK_${pack.toUpperCase()}_HARDWARE`];
  if (priceId) {
    return { price: priceId, quantity: 1 };
  }
  // Fallback: inline price_data (matches PACKS amounts)
  return {
    price_data: {
      currency: 'eur' as const,
      unit_amount: packDef.hardwareAmount,
      product_data: {
        name: `Digitip — Pack ${pack.charAt(0).toUpperCase() + pack.slice(1)}`,
        description: `${packDef.quantity} plaque${packDef.quantity > 1 ? 's' : ''} époxy NFC`,
      },
    },
    quantity: 1,
  };
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request.headers);
  const rl = await rateLimit(`express-checkout:${ip}`, { limit: 5, windowMs: 60_000 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    );
  }

  let body: { pack?: unknown; locale?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!isValidPack(body.pack)) {
    return NextResponse.json({ error: 'Invalid pack' }, { status: 400 });
  }

  const pack = body.pack;
  const locale = body.locale === 'fr' ? 'fr' : 'en';
  const base = getBaseUrl();
  const packDef = PACKS[pack];

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_creation: 'always',
      billing_address_collection: 'required',
      shipping_address_collection: {
        allowed_countries: [...ALLOWED_SHIPPING_COUNTRIES],
      },
      phone_number_collection: { enabled: false },
      line_items: [getLineItem(pack)],
      automatic_tax: { enabled: true },
      tax_id_collection: { enabled: true },
      allow_promotion_codes: true,
      success_url: `${base}/${locale}/order/success?session_id={CHECKOUT_SESSION_ID}&source=express`,
      cancel_url: `${base}/${locale}/`,
      metadata: {
        pack,
        source: 'express',
        quantity: String(packDef.quantity),
      },
    });

    return NextResponse.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Stripe error';
    console.error('[express-checkout]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
