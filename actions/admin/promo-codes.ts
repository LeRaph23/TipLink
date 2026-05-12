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

    const normalizedCode = code.trim().toUpperCase();

    // Check uniqueness in our DB first
    const { data: existing } = await service.from('promo_codes').select('id').eq('code', normalizedCode).maybeSingle();
    if (existing) return { ok: false, error: `Le code "${normalizedCode}" existe déjà.` };

    // Create Stripe coupon — used for direct application at checkout
    const coupon = await stripe.coupons.create({
      percent_off: percentageOff,
      duration: 'once',
      name: `TipLink ${percentageOff}% — ${normalizedCode}`,
      ...(maxRedemptions ? { max_redemptions: maxRedemptions } : {}),
      ...(expiresAt ? { redeem_by: Math.floor(new Date(expiresAt).getTime() / 1000) } : {}),
    });

    // Create a Stripe Promotion Code so users can enter the code at Stripe checkout natively.
    // Stripe SDK v22: coupon is nested under promotion.{ type, coupon }.
    const promotionCode = await stripe.promotionCodes.create({
      promotion: { type: 'coupon', coupon: coupon.id },
      code: normalizedCode,
      active: true,
      ...(maxRedemptions ? { max_redemptions: maxRedemptions } : {}),
      ...(expiresAt ? { expires_at: Math.floor(new Date(expiresAt).getTime() / 1000) } : {}),
    });

    // Save to our DB. stripe_promo_code_id stores the Stripe Promotion Code ID for toggling.
    const { data: saved, error: dbErr } = await service
      .from('promo_codes')
      .insert({
        code: normalizedCode,
        stripe_coupon_id: coupon.id,
        stripe_promo_code_id: promotionCode.id,
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
      id: saved.id, code: normalizedCode, percentageOff, maxRedemptions, expiresAt,
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
      .select('stripe_coupon_id, stripe_promo_code_id, code')
      .eq('id', id)
      .single();

    if (!promo) return { ok: false, error: 'Code promo introuvable.' };

    // Update Stripe Promotion Code active status (so Stripe-native promo code field respects it).
    // Stripe coupons can't be toggled directly, but Promotion Codes can.
    // Silently ignore if the stored ID is a legacy coupon ID (pre-fix codes).
    try {
      await stripe.promotionCodes.update(promo.stripe_promo_code_id, { active: isActive });
    } catch {
      // Legacy code — stripe_promo_code_id may not exist yet; DB flag is still enforced at checkout.
    }

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
