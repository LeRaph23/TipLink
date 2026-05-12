'use server';

import crypto from 'node:crypto';
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

export type CreateAmbassadorInput = {
  name: string;
  promoCodeId: string;
  pin: string;
};

export async function createAmbassador(
  input: CreateAmbassadorInput
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    const user = await requireSuperAdminUser();
    const service = createServiceClient();

    const { name, promoCodeId, pin } = input;

    if (!name || name.trim().length < 2) {
      return { ok: false, error: 'Nom trop court (min 2 caractères).' };
    }
    if (!/^\d{4}$/.test(pin)) {
      return { ok: false, error: 'Le PIN doit contenir exactement 4 chiffres.' };
    }
    if (!promoCodeId) {
      return { ok: false, error: 'Code promo requis.' };
    }

    // Verify promo code exists and is not already linked to an ambassador
    const { data: promoCode } = await service
      .from('promo_codes')
      .select('id, code')
      .eq('id', promoCodeId)
      .eq('is_active', true)
      .maybeSingle();

    if (!promoCode) {
      return { ok: false, error: 'Code promo introuvable ou inactif.' };
    }

    const { data: existing } = await service
      .from('ambassadors')
      .select('id')
      .eq('promo_code_id', promoCodeId)
      .maybeSingle();

    if (existing) {
      return { ok: false, error: 'Ce code promo est déjà lié à un ambassadeur.' };
    }

    const id = crypto.randomUUID();
    const pinSalt = crypto.randomBytes(32).toString('hex');
    const pinHash = crypto.scryptSync(pin, pinSalt, 64).toString('hex');

    const { data: saved, error: dbErr } = await service
      .from('ambassadors')
      .insert({
        id,
        name: name.trim(),
        promo_code_id: promoCodeId,
        pin_hash: pinHash,
        pin_salt: pinSalt,
        is_active: true,
      })
      .select('id')
      .single();

    if (dbErr || !saved) {
      return { ok: false, error: `Erreur DB: ${dbErr?.message ?? 'unknown'}` };
    }

    await logAdminAction('ambassadors.create', {
      id: saved.id,
      name: name.trim(),
      promoCode: promoCode.code,
    });

    return { ok: true, id: saved.id };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erreur inconnue';
    return { ok: false, error: msg };
  }
}

export async function toggleAmbassador(
  id: string,
  isActive: boolean
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await requireSuperAdminUser();
    const service = createServiceClient();

    const { data: amb } = await service
      .from('ambassadors')
      .select('name')
      .eq('id', id)
      .single();

    if (!amb) return { ok: false, error: 'Ambassadeur introuvable.' };

    await service.from('ambassadors').update({ is_active: isActive }).eq('id', id);

    await logAdminAction(isActive ? 'ambassadors.activate' : 'ambassadors.deactivate', { id, name: amb.name });

    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erreur inconnue';
    return { ok: false, error: msg };
  }
}

export async function markAmbassadorPayoutPaid(
  payoutId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await requireSuperAdminUser();
    const service = createServiceClient();
    const { data: payout } = await service
      .from('ambassador_payouts')
      .select('id, ambassador_id, amount_cents, status')
      .eq('id', payoutId)
      .maybeSingle();
    if (!payout) return { ok: false, error: 'Versement introuvable.' };
    if (payout.status === 'paid') return { ok: false, error: 'Déjà marqué payé.' };

    const { error } = await service
      .from('ambassador_payouts')
      .update({ status: 'paid', paid_at: new Date().toISOString() })
      .eq('id', payoutId);
    if (error) return { ok: false, error: error.message };

    await logAdminAction('ambassadors.payout_paid', {
      payoutId,
      ambassadorId: payout.ambassador_id,
      amountCents: payout.amount_cents,
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur inconnue' };
  }
}

export async function cancelAmbassadorPayout(
  payoutId: string,
  reason?: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await requireSuperAdminUser();
    const service = createServiceClient();
    const { data: payout } = await service
      .from('ambassador_payouts')
      .select('id, ambassador_id, status')
      .eq('id', payoutId)
      .maybeSingle();
    if (!payout) return { ok: false, error: 'Versement introuvable.' };
    if (payout.status === 'paid') return { ok: false, error: 'Impossible d\'annuler un versement déjà payé.' };

    const { error } = await service
      .from('ambassador_payouts')
      .update({ status: 'canceled', failure_reason: reason ?? null })
      .eq('id', payoutId);
    if (error) return { ok: false, error: error.message };

    await logAdminAction('ambassadors.payout_canceled', {
      payoutId,
      ambassadorId: payout.ambassador_id,
      reason,
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur inconnue' };
  }
}

export async function resetAmbassadorPin(
  id: string,
  newPin: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await requireSuperAdminUser();
    const service = createServiceClient();

    if (!/^\d{4}$/.test(newPin)) {
      return { ok: false, error: 'Le PIN doit contenir exactement 4 chiffres.' };
    }

    const pinSalt = crypto.randomBytes(32).toString('hex');
    const pinHash = crypto.scryptSync(newPin, pinSalt, 64).toString('hex');

    const { error: dbErr } = await service
      .from('ambassadors')
      .update({ pin_hash: pinHash, pin_salt: pinSalt })
      .eq('id', id);

    if (dbErr) return { ok: false, error: dbErr.message };

    await logAdminAction('ambassadors.reset_pin', { id });

    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erreur inconnue';
    return { ok: false, error: msg };
  }
}
