'use server';

import crypto from 'node:crypto';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { logAdminAction } from '@/lib/admin/audit';
import { generateUniqueReferralCode } from '@/lib/referrals';
import { REFERRAL_VALIDATION_MIN_SALES } from '@/lib/ambassador-tiers';

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
  referrerAmbassadorId?: string | null;
};

export type CreateAmbassadorResult =
  | { ok: true; id: string; setupToken: string; setupUrl: string; expiresAt: string }
  | { ok: false; error: string };

const SETUP_TOKEN_TTL_DAYS = 14;

function generateSetupToken(): string {
  // URL-safe 32-byte token (43 chars base64url).
  return crypto.randomBytes(32).toString('base64url');
}

function buildSetupUrl(promoCode: string, token: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://digitip.app').replace(/\/$/, '');
  return `${base}/fr/ambassadeur/${promoCode.toLowerCase()}?setup=${encodeURIComponent(token)}`;
}

export async function createAmbassador(
  input: CreateAmbassadorInput
): Promise<CreateAmbassadorResult> {
  try {
    await requireSuperAdminUser();
    const service = createServiceClient();

    const { name, promoCodeId, referrerAmbassadorId } = input;

    if (!name || name.trim().length < 2) {
      return { ok: false, error: 'Nom trop court (min 2 caractères).' };
    }
    if (!promoCodeId) {
      return { ok: false, error: 'Code promo requis.' };
    }

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

    // Validate the parrain (referrer) so the referral chain is never built on
    // a dangling id — the referral payouts depend on it being a real ambassador.
    if (referrerAmbassadorId) {
      const { data: referrer } = await service
        .from('ambassadors')
        .select('id')
        .eq('id', referrerAmbassadorId)
        .maybeSingle();
      if (!referrer) {
        return { ok: false, error: 'Parrain introuvable.' };
      }
    }

    const id = crypto.randomUUID();
    const setupToken = generateSetupToken();
    const expiresAt = new Date(Date.now() + SETUP_TOKEN_TTL_DAYS * 86400000).toISOString();
    const referralCode = await generateUniqueReferralCode(service, name.trim());

    const { data: saved, error: dbErr } = await service
      .from('ambassadors')
      .insert({
        id,
        name: name.trim(),
        promo_code_id: promoCodeId,
        pin_hash: null,
        pin_salt: null,
        is_active: true,
        referral_code: referralCode,
        referrer_ambassador_id: referrerAmbassadorId ?? null,
        pin_setup_token: setupToken,
        pin_setup_expires_at: expiresAt,
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

    return {
      ok: true,
      id: saved.id,
      setupToken,
      setupUrl: buildSetupUrl(promoCode.code, setupToken),
      expiresAt,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erreur inconnue';
    return { ok: false, error: msg };
  }
}

export async function regenerateAmbassadorSetupToken(
  id: string
): Promise<{ ok: true; setupUrl: string; expiresAt: string } | { ok: false; error: string }> {
  try {
    await requireSuperAdminUser();
    const service = createServiceClient();

    const { data: amb } = await service
      .from('ambassadors')
      .select('id, name, promo_codes(code)')
      .eq('id', id)
      .maybeSingle();

    if (!amb) return { ok: false, error: 'Ambassadeur introuvable.' };

    const promoCode = (amb.promo_codes as { code?: string } | { code?: string }[] | null);
    const code = Array.isArray(promoCode) ? promoCode[0]?.code : promoCode?.code;
    if (!code) return { ok: false, error: 'Code promo introuvable.' };

    const setupToken = generateSetupToken();
    const expiresAt = new Date(Date.now() + SETUP_TOKEN_TTL_DAYS * 86400000).toISOString();

    // Clear existing PIN so the ambassador must re-set it via the new activation link
    const { error } = await service
      .from('ambassadors')
      .update({
        pin_hash: null,
        pin_salt: null,
        pin_setup_token: setupToken,
        pin_setup_expires_at: expiresAt,
      })
      .eq('id', id);

    if (error) return { ok: false, error: error.message };

    await logAdminAction('ambassadors.regenerate_setup_token', { id });
    return { ok: true, setupUrl: buildSetupUrl(code, setupToken), expiresAt };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur inconnue' };
  }
}

export async function deleteAmbassador(
  id: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await requireSuperAdminUser();
    const service = createServiceClient();

    const { data: amb } = await service
      .from('ambassadors')
      .select('id, name')
      .eq('id', id)
      .maybeSingle();

    if (!amb) return { ok: false, error: 'Ambassadeur introuvable.' };

    const { count: salesCount } = await service
      .from('ambassador_sales')
      .select('id', { count: 'exact', head: true })
      .eq('ambassador_id', id);

    if ((salesCount ?? 0) > 0) {
      return {
        ok: false,
        error: `Suppression impossible : ${salesCount} vente(s) enregistrée(s). Désactive plutôt l'ambassadeur pour préserver l'historique.`,
      };
    }

    const { error } = await service.from('ambassadors').delete().eq('id', id);
    if (error) return { ok: false, error: error.message };

    await logAdminAction('ambassadors.delete', { id, name: amb.name });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur inconnue' };
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

/**
 * Freezes or unfreezes an ambassador's withdrawals. A frozen ambassador can
 * still log in and see their dashboard but the payout route refuses any
 * request — used to hold funds while investigating fraud or a dispute,
 * without wiping the account the way deactivation does.
 */
export async function setAmbassadorPayoutsFrozen(
  id: string,
  frozen: boolean
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await requireSuperAdminUser();
    const service = createServiceClient();

    const { data: amb } = await service
      .from('ambassadors')
      .select('name')
      .eq('id', id)
      .maybeSingle();

    if (!amb) return { ok: false, error: 'Ambassadeur introuvable.' };

    const { error } = await service
      .from('ambassadors')
      .update({ payouts_frozen: frozen })
      .eq('id', id);

    if (error) return { ok: false, error: error.message };

    await logAdminAction(
      frozen ? 'ambassadors.freeze_payouts' : 'ambassadors.unfreeze_payouts',
      { id, name: amb.name }
    );
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur inconnue' };
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

export async function reviewRecruitmentApplication(
  id: string,
  status: 'accepted' | 'rejected'
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await requireSuperAdminUser();
    const service = createServiceClient();

    const { data: app } = await service
      .from('ambassador_recruitment_applications')
      .select('id, status')
      .eq('id', id)
      .maybeSingle();

    if (!app) return { ok: false, error: 'Candidature introuvable.' };
    if (app.status !== 'pending') return { ok: false, error: 'Cette candidature a déjà été traitée.' };

    const { error } = await service
      .from('ambassador_recruitment_applications')
      .update({ status, reviewed_at: new Date().toISOString() })
      .eq('id', id);

    if (error) return { ok: false, error: error.message };

    await logAdminAction(`ambassadors.recruitment_${status}`, { id });

    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur inconnue' };
  }
}

/**
 * Credits a referral reward to the parrain's withdrawable balance. The reward
 * row is created automatically once its condition is met (a filleul reaches
 * the sale threshold, or the parrain reaches a milestone), but it stays
 * `pending` until a super-admin explicitly credits it here — that is the
 * manual gate over referral money.
 *
 * The underlying condition is re-verified at credit time so a reward can never
 * be granted on sales that were since refunded.
 */
export async function creditReferralPayout(
  payoutId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await requireSuperAdminUser();
    const service = createServiceClient();

    const { data: payout } = await service
      .from('referral_payouts')
      .select('id, status, reason, referrer_ambassador_id, referred_ambassador_id, amount_cents')
      .eq('id', payoutId)
      .maybeSingle();

    if (!payout) return { ok: false, error: 'Prime de parrainage introuvable.' };
    if (payout.status === 'credited') return { ok: false, error: 'Cette prime est déjà créditée.' };
    if (payout.status === 'voided') return { ok: false, error: 'Cette prime a été annulée.' };

    // Re-verify the condition still holds — refunds may have collapsed it.
    if (payout.reason === 'validation') {
      const { count } = await service
        .from('ambassador_sales')
        .select('id', { count: 'exact', head: true })
        .eq('ambassador_id', payout.referred_ambassador_id)
        .is('voided_at', null);
      if ((count ?? 0) < REFERRAL_VALIDATION_MIN_SALES) {
        return {
          ok: false,
          error: `Le filleul n'a plus ${REFERRAL_VALIDATION_MIN_SALES} ventes valides — prime non créditable.`,
        };
      }
    } else {
      const threshold = payout.reason === 'milestone_5' ? 5 : 10;
      const { count } = await service
        .from('ambassadors')
        .select('id', { count: 'exact', head: true })
        .eq('referrer_ambassador_id', payout.referrer_ambassador_id)
        .not('referral_validated_at', 'is', null);
      if ((count ?? 0) < threshold) {
        return { ok: false, error: `Palier non atteint (${count ?? 0}/${threshold} filleuls validés).` };
      }
    }

    const { error } = await service
      .from('referral_payouts')
      .update({ status: 'credited', credited_at: new Date().toISOString() })
      .eq('id', payoutId)
      .eq('status', 'pending');

    if (error) return { ok: false, error: error.message };

    await logAdminAction('referral.credit', {
      payoutId,
      referrerId: payout.referrer_ambassador_id,
      reason: payout.reason,
      amountCents: payout.amount_cents,
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur inconnue' };
  }
}

/**
 * Rejects a still-pending referral reward (e.g. suspected fraud). A credited
 * reward cannot be voided this way — it is already in the parrain's balance.
 */
export async function voidReferralPayout(
  payoutId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await requireSuperAdminUser();
    const service = createServiceClient();

    const { data: payout } = await service
      .from('referral_payouts')
      .select('id, status, referrer_ambassador_id, reason')
      .eq('id', payoutId)
      .maybeSingle();

    if (!payout) return { ok: false, error: 'Prime de parrainage introuvable.' };
    if (payout.status === 'credited') {
      return { ok: false, error: 'Impossible d\'annuler une prime déjà créditée.' };
    }
    if (payout.status === 'voided') return { ok: false, error: 'Cette prime est déjà annulée.' };

    const { error } = await service
      .from('referral_payouts')
      .update({ status: 'voided' })
      .eq('id', payoutId)
      .eq('status', 'pending');

    if (error) return { ok: false, error: error.message };

    await logAdminAction('referral.void', {
      payoutId,
      referrerId: payout.referrer_ambassador_id,
      reason: payout.reason,
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur inconnue' };
  }
}
