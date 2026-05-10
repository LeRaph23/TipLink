'use server';

import { stripe } from '@/lib/stripe/client';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { logAdminAction } from '@/lib/admin/audit';

async function requireSuperAdminUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthenticated');
  const { data: roles } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .eq('role', 'super_admin')
    .limit(1);
  if (!roles?.length) throw new Error('Forbidden');
  return user;
}

export type CreatePromoCodeInput = {
  code: string;
  percentageOff: number;
  maxRedemptions?: number | null;
  expiresAt?: string | null;
};

export async function createPromoCode(input: CreatePromoCodeInput): Promise<
  { ok: true; id: string } | { ok: false; error: string }
> {
  try {
    const user = await requireSuperAdminUser();
    const service = createServiceClient();

    const { code, percentageOff, maxRedemptions, expiresAt } = input;

    if (!code || code.trim().length < 2) return { ok: false, error: 'Code trop court (min 2 caractères).' };
    if (percentageOff < 1 || percentageOff > 100) return { ok: false, error: 'Pourcentage invalide (1-100).' };

    // Check uniqueness in our DB first
    const { data: existing } = await service.from('promo_codes').select('id').eq('code', code.toUpperCase().trim()).maybeSingle();
    if (existing) return { ok: false, error: `Le code "${code.toUpperCase()}" existe déjà.` };

    // Create Stripe coupon
    const coupon = await stripe.coupons.create({
      percent_off: percentageOff,
      duration: 'once',
      name: `TipLink ${percentageOff}% — ${code.toUpperCase()}`,
      ...(maxRedemptions ? { max_redemptions: maxRedemptions } : {}),
      ...(expiresAt ? { redeem_by: Math.floor(new Date(expiresAt).getTime() / 1000) } : {}),
    });

    // Create Stripe promotion code (v22 API: coupon is nested inside `promotion`)
    const promoCode = await stripe.promotionCodes.create({
      promotion: { type: 'coupon', coupon: coupon.id },
      code: code.toUpperCase().trim(),
      ...(maxRedemptions ? { max_redemptions: maxRedemptions } : {}),
      ...(expiresAt ? { expires_at: Math.floor(new Date(expiresAt).getTime() / 1000) } : {}),
    });

    // Save to our DB
    const { data: saved, error: dbErr } = await service
      .from('promo_codes')
      .insert({
        code: code.toUpperCase().trim(),
        stripe_coupon_id: coupon.id,
        stripe_promo_code_id: promoCode.id,
        percentage_off: percentageOff,
        max_redemptions: maxRedemptions ?? null,
        expires_at: expiresAt ?? null,
        created_by: user.id,
        is_active: true,
      })
      .select('id')
      .single();

    if (dbErr || !saved) {
      return { ok: false, error: `Erreur DB: ${dbErr?.message ?? 'unknown'}` };
    }

    await logAdminAction('promo_codes.create', {
      id: saved.id, code: code.toUpperCase(), percentageOff, maxRedemptions, expiresAt,
    });

    return { ok: true, id: saved.id };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erreur inconnue';
    return { ok: false, error: msg };
  }
}

export async function togglePromoCode(
  id: string,
  isActive: boolean
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await requireSuperAdminUser();
    const service = createServiceClient();

    const { data: promo } = await service
      .from('promo_codes')
      .select('stripe_promo_code_id, code')
      .eq('id', id)
      .single();

    if (!promo) return { ok: false, error: 'Code promo introuvable.' };

    // Update Stripe promotion code active state
    await stripe.promotionCodes.update(promo.stripe_promo_code_id, { active: isActive });

    await service.from('promo_codes').update({ is_active: isActive }).eq('id', id);

    await logAdminAction(isActive ? 'promo_codes.activate' : 'promo_codes.deactivate', {
      id, code: promo.code,
    });

    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erreur inconnue';
    return { ok: false, error: msg };
  }
}
