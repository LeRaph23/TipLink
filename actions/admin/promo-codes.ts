'use server';

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { logAdminAction } from '@/lib/admin/audit';

// Promo codes are pure database rows: the percentage discount is applied
// in-app at checkout (lib/billing/promo.ts). Mangopay has no coupon catalog,
// so there are no external resources to keep in sync.

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

    const { data: saved, error: dbErr } = await service
      .from('promo_codes')
      .insert({
        code: normalizedCode,
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
      .select('code')
      .eq('id', id)
      .single();

    if (!promo) return { ok: false, error: 'Code promo introuvable.' };

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

    const { error: dbErr } = await service.from('promo_codes').update({
      code: normalizedCode,
      percentage_off: percentageOff,
      max_redemptions: maxRedemptions ?? null,
      expires_at: expiresAt ?? null,
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
      .select('code, times_redeemed')
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    if (!promo) return { ok: false, error: 'Code promo introuvable.' };

    await service.from('promo_codes').update({ deleted_at: new Date().toISOString(), is_active: false }).eq('id', id);

    await logAdminAction('promo_codes.delete', { id, code: promo.code, timesRedeemed: promo.times_redeemed });

    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erreur inconnue';
    return { ok: false, error: msg };
  }
}
