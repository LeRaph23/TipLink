import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe/client';
import { PACKS, type PackId } from '@/lib/env';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { createServiceClient } from '@/lib/supabase/service';

export const runtime = 'nodejs';

function isValidPack(p: unknown): p is PackId {
  return p === 'solo' || p === 'duo';
}

type PromoResolved = {
  code: string;
  promo_code_id: string;
  percentage_off: number;
  stripe_promo_code_id: string;
};

async function resolvePromoCode(
  supabase: ReturnType<typeof createServiceClient>,
  rawCode: string
): Promise<PromoResolved | null> {
  const code = rawCode.trim().toUpperCase();
  if (!code) return null;
  const { data } = await supabase
    .from('promo_codes')
    .select('id, code, percentage_off, max_redemptions, times_redeemed, expires_at, is_active, stripe_promo_code_id')
    .eq('code', code)
    .maybeSingle();
  if (!data || !data.is_active) return null;
  if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) return null;
  if (data.max_redemptions != null && data.times_redeemed >= data.max_redemptions) return null;
  return {
    code: data.code,
    promo_code_id: data.id,
    percentage_off: data.percentage_off,
    stripe_promo_code_id: data.stripe_promo_code_id,
  };
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request.headers);
  const rl = await rateLimit(`create-pack-intent:${ip}`, { limit: 5, windowMs: 60_000 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    );
  }

  let body: { pack?: unknown; locale?: unknown; promoCode?: unknown };
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
  const packDef = PACKS[pack];
  const baseAmount = packDef.hardwareAmount;

  const supabase = createServiceClient();

  // Optional promo code
  let promo: PromoResolved | null = null;
  let discountAmount = 0;
  if (typeof body.promoCode === 'string' && body.promoCode.trim().length > 0) {
    promo = await resolvePromoCode(supabase, body.promoCode);
    if (!promo) {
      return NextResponse.json({ error: 'Invalid promo code' }, { status: 400 });
    }
    discountAmount = Math.floor((baseAmount * promo.percentage_off) / 100);
  }
  const amount = Math.max(0, baseAmount - discountAmount);

  try {
    const intent = await stripe.paymentIntents.create({
      amount,
      currency: 'eur',
      automatic_payment_methods: { enabled: true },
      description: `Digitip — Pack ${pack.charAt(0).toUpperCase() + pack.slice(1)}`,
      metadata: {
        source: 'pack-express',
        pack,
        quantity: String(packDef.quantity),
        locale,
        base_amount: String(baseAmount),
        discount_amount: String(discountAmount),
        ...(promo ? { promo_code: promo.code, promo_code_id: promo.promo_code_id } : {}),
      },
    });

    return NextResponse.json({
      clientSecret: intent.client_secret,
      paymentIntentId: intent.id,
      amount,
      baseAmount,
      discountAmount,
      promoCode: promo?.code ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Stripe error';
    console.error('[create-pack-intent]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
