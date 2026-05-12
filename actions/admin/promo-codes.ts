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

    const { data: existing } = await service.from('promo_codes').select('id').eq('code', normalizedCode).is('deleted_at', null).maybeSingle();
    if (existing) return { ok: false, error: `Le code "${normalizedCode}" existe déjà.` };

    const coupon = await stripe.coupons.create({
      percent_off: percentageOff,
      duration: 'once',
      name: `TipLink ${percentageOff}% — ${normalizedCode}`,
      ...(maxRedemptions ? { max_redemptions: maxRedemptions } : {}),
      ...(expiresAt ? { redeem_by: Math.floor(new Date(expiresAt).getTime() / 1000) } : {}),
    });

    const promotionCode = await stripe.promotionCodes.create({
      promotion: { type: 'coupon', coupon: coupon.id },
      code: normalizedCode,
      active: true,
      ...(maxRedemptions ? { max_redemptions: maxRedemptions } : {}),
      ...(expiresAt ? { expires_at: Math.floor(new Date(expiresAt).getTime() / 1000) } : {}),
    });

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

export type UpdatePromoCodeInput = {
  code: string;
  percentageOff: number;
  maxRedemptions: number | null;
  expiresAt: string | null;
};

export async function updatePromoCode(
  id: string,
  input: UpdatePromoCodeInput
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await requireSuperAdminUser();
    const service = createServiceClient();

    const { data: promo } = await service
      .from('promo_codes')
      .select('*')
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    if (!promo) return { ok: false, error: 'Code promo introuvable.' };

    const { code, percentageOff, maxRedemptions, expiresAt } = input;
    const normalizedCode = code.trim().toUpperCase();

    if (!normalizedCode || normalizedCode.length < 2) return { ok: false, error: 'Code trop court (min 2 caractères).' };
    if (percentageOff < 1 || percentageOff > 100) return { ok: false, error: 'Pourcentage invalide (1-100).' };

    if (normalizedCode !== promo.code) {
      const { data: existing } = await service
        .from('promo_codes')
        .select('id')
        .eq('code', normalizedCode)
        .is('deleted_at', null)
        .maybeSingle();
      if (existing) return { ok: false, error: `Le code "${normalizedCode}" existe déjà.` };
    }

    let newStripeCouponId = promo.stripe_coupon_id;
    let newStripePromoCodeId = promo.stripe_promo_code_id;

    if (percentageOff !== promo.percentage_off) {
      // Recreate Stripe resources when percentage changes
      try {
        await stripe.promotionCodes.update(promo.stripe_promo_code_id, { active: false });
      } catch { /* ignore */ }

      try {
        await stripe.coupons.del(promo.stripe_coupon_id);
      } catch { /* ignore */ }

      const newCoupon = await stripe.coupons.create({
        percent_off: percentageOff,
        duration: 'once',
        name: `TipLink ${percentageOff}% — ${normalizedCode}`,
        ...(maxRedemptions ? { max_redemptions: maxRedemptions } : {}),
        ...(expiresAt ? { redeem_by: Math.floor(new Date(expiresAt).getTime() / 1000) } : {}),
      });
      newStripeCouponId = newCoupon.id;

      // Create new Stripe promo code only if code string changed (old string is still "taken" in Stripe even when deactivated)
      if (normalizedCode !== promo.code) {
        try {
          const newPromo = await stripe.promotionCodes.create({
            promotion: { type: 'coupon', coupon: newCoupon.id },
            code: normalizedCode,
            active: promo.is_active,
            ...(maxRedemptions ? { max_redemptions: maxRedemptions } : {}),
            ...(expiresAt ? { expires_at: Math.floor(new Date(expiresAt).getTime() / 1000) } : {}),
          });
          newStripePromoCodeId = newPromo.id;
        } catch { /* keep old reference */ }
      }
    } else if (normalizedCode !== promo.code) {
      // Only code name changed — update Stripe coupon display name
      try {
        await stripe.coupons.update(promo.stripe_coupon_id, {
          name: `TipLink ${percentageOff}% — ${normalizedCode}`,
        });
      } catch { /* ignore */ }
    }

    const { error: dbErr } = await service.from('promo_codes').update({
      code: normalizedCode,
      percentage_off: percentageOff,
      max_redemptions: maxRedemptions ?? null,
      expires_at: expiresAt ?? null,
      stripe_coupon_id: newStripeCouponId,
      stripe_promo_code_id: newStripePromoCodeId,
    }).eq('id', id);

    if (dbErr) return { ok: false, error: `Erreur DB: ${dbErr.message}` };

    await logAdminAction('promo_codes.update', {
      id, code: normalizedCode, percentageOff, maxRedemptions, expiresAt,
    });

    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erreur inconnue';
    return { ok: false, error: msg };
  }
}

export async function deletePromoCode(
  id: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await requireSuperAdminUser();
    const service = createServiceClient();

    const { data: promo } = await service
      .from('promo_codes')
      .select('stripe_coupon_id, stripe_promo_code_id, code, times_redeemed')
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    if (!promo) return { ok: false, error: 'Code promo introuvable.' };

    // Deactivate Stripe promotion code
    try {
      await stripe.promotionCodes.update(promo.stripe_promo_code_id, { active: false });
    } catch { /* ignore */ }

    // Delete Stripe coupon
    try {
      await stripe.coupons.del(promo.stripe_coupon_id);
    } catch { /* ignore */ }

    // Soft delete in DB
    await service.from('promo_codes').update({ deleted_at: new Date().toISOString(), is_active: false }).eq('id', id);

    await logAdminAction('promo_codes.delete', { id, code: promo.code, timesRedeemed: promo.times_redeemed });

    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erreur inconnue';
    return { ok: false, error: msg };
  }
}
