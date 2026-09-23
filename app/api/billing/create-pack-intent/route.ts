import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe/client';
import { type PackId } from '@/lib/env';
import { getPackPricing } from '@/lib/stripe/pricing';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { createServiceClient } from '@/lib/supabase/service';
import { isUpstreamUnavailable } from '@/lib/errors/upstream';
import { provisionalPackTax } from '@/lib/stripe/tax';

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
  try {
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

    // Stripe is the source of truth for the actual charged amount.
    const pricing = await getPackPricing(pack);
    const baseAmount = pricing.unitAmount;

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
    const htAmount = Math.max(0, baseAmount - discountAmount);

    // Created already taxed, at the domestic rate. The intent used to be
    // created at the bare HT amount, with VAT added only if the browser later
    // called /api/billing/pack-tax — so the sole guard against paying 79 euros
    // instead of 94,80 was a client-side flag, and the VAT was owed regardless.
    // /api/billing/pack-tax replaces this with the real address-based figure
    // before the buyer reaches a payable total in the normal flow.
    const provisional = provisionalPackTax(htAmount);

    const intent = await stripe.paymentIntents.create({
      amount: provisional.totalAmount,
      currency: pricing.currency,
      automatic_payment_methods: { enabled: true },
      description: pricing.productName,
      metadata: {
        source: 'pack-express',
        pack,
        quantity: String(pricing.quantity),
        locale,
        base_amount: String(baseAmount),
        discount_amount: String(discountAmount),
        // Always set, so the invoice builder never has to fall through to its
        // "VAT included in the price" branch and produce a document that
        // contradicts the HT price advertised on the site.
        ht_amount: String(provisional.htAmount),
        tax_amount: String(provisional.taxAmount),
        tax_country: provisional.country,
        // Cleared by pack-tax once a real shipping address has been priced.
        tax_provisional: 'true',
        ...(promo ? { promo_code: promo.code, promo_code_id: promo.promo_code_id } : {}),
      },
    });

    return NextResponse.json({
      clientSecret: intent.client_secret,
      paymentIntentId: intent.id,
      amount: provisional.totalAmount,
      baseAmount,
      discountAmount,
      htAmount: provisional.htAmount,
      taxAmount: provisional.taxAmount,
      taxProvisional: true,
      promoCode: promo?.code ?? null,
    });
  } catch (err) {
    // Any failure (rate-limit backend, pricing/Stripe lookup, service client,
    // PaymentIntent creation, …) must still return JSON — an unhandled throw
    // here yields an empty 500 body and the client crashes on res.json().
    // Never echo the raw error to the client (it can carry keys / internals).
    console.error('[create-pack-intent]', err instanceof Error ? err.message : err);
    // Distinguish "external service unreachable" (transient) from a real
    // failure so the UI can tell the buyer to simply retry in a moment.
    if (isUpstreamUnavailable(err)) {
      return NextResponse.json({ error: 'payment_unavailable' }, { status: 503 });
    }
    return NextResponse.json({ error: 'payment_failed' }, { status: 500 });
  }
}
