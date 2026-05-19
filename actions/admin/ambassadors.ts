'use server';

import crypto from 'node:crypto';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { logAdminAction } from '@/lib/admin/audit';
import {
  generateUniqueReferralCode,
  recomputeReferralAfterSaleChange,
  recomputeMilestones,
} from '@/lib/referrals';
import {
  MONTHLY_CHALLENGE,
  REFERRAL_VALIDATION_MIN_SALES,
  computeClosedWeekBonusBreakdown,
} from '@/lib/ambassador-tiers';
import { settleExpiredChallenges } from '@/lib/ambassador-monthly-challenge';
import { createPromoCode, deletePromoCode } from './promo-codes';

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
  email?: string | null;
  phone?: string | null;
  siret?: string | null;
  city?: string | null;
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

    const { name, promoCodeId, referrerAmbassadorId, email, phone, siret, city } = input;

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
        email: email ?? null,
        phone: phone ?? null,
        siret: siret ?? null,
        city: city ?? null,
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

/**
 * Sets or changes an ambassador's parrain after creation — for the case where
 * an ambassador was created without linking the referrer. Voids any pending
 * referral reward owed to the previous parrain, then recomputes the referral
 * state for the new one (a filleul who already has 3+ sales immediately gets
 * a pending 25€ reward for the new parrain, which the super-admin then credits).
 */
export async function setAmbassadorReferrer(
  ambassadorId: string,
  referrerAmbassadorId: string | null
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await requireSuperAdminUser();
    const service = createServiceClient();

    const { data: amb } = await service
      .from('ambassadors')
      .select('id, name, referrer_ambassador_id')
      .eq('id', ambassadorId)
      .maybeSingle();

    if (!amb) return { ok: false, error: 'Ambassadeur introuvable.' };

    const newReferrer = referrerAmbassadorId || null;
    const oldReferrer = amb.referrer_ambassador_id;
    if (newReferrer === oldReferrer) return { ok: true };

    if (newReferrer) {
      if (newReferrer === ambassadorId) {
        return { ok: false, error: 'Un ambassadeur ne peut pas être son propre parrain.' };
      }
      // Walk up the proposed parrain's chain — reject if it loops back here.
      let cursor: string | null = newReferrer;
      for (let depth = 0; cursor && depth < 50; depth++) {
        if (cursor === ambassadorId) {
          return { ok: false, error: 'Ce choix créerait une boucle de parrainage.' };
        }
        const { data: up }: { data: { referrer_ambassador_id: string | null } | null } =
          await service
            .from('ambassadors')
            .select('referrer_ambassador_id')
            .eq('id', cursor)
            .maybeSingle();
        if (!up) {
          if (cursor === newReferrer) return { ok: false, error: 'Parrain introuvable.' };
          break;
        }
        cursor = up.referrer_ambassador_id;
      }
    }

    // Detach from the previous parrain: a still-pending validation reward owed
    // to them is no longer due (a credited one is left — money already given).
    if (oldReferrer) {
      await service
        .from('referral_payouts')
        .update({ status: 'voided' })
        .eq('referrer_ambassador_id', oldReferrer)
        .eq('referred_ambassador_id', ambassadorId)
        .eq('reason', 'validation')
        .eq('status', 'pending');
    }

    const { error } = await service
      .from('ambassadors')
      .update({ referrer_ambassador_id: newReferrer })
      .eq('id', ambassadorId);

    if (error) return { ok: false, error: error.message };

    // Recompute both sides: the old parrain may lose a milestone, the new one
    // gains a filleul (and a pending reward if the 3-sale threshold is met).
    if (oldReferrer) await recomputeMilestones(service, oldReferrer);
    if (newReferrer) await recomputeReferralAfterSaleChange(service, ambassadorId);

    await logAdminAction('ambassadors.set_referrer', {
      id: ambassadorId,
      name: amb.name,
      oldReferrer,
      newReferrer,
    });
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

/**
 * Activates or deactivates the monthly challenge (100€ to the #1 ambassador).
 * Activating starts a fresh one-month window; deactivating cancels the running
 * challenge without recording a winner. Elapsed challenges are settled first so
 * a finished month's winner is always recorded — the prize is then released
 * manually from the "Bonus à vérifier" panel (no automatic credit).
 */
export async function setMonthlyChallengeActive(
  active: boolean
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const user = await requireSuperAdminUser();
    const service = createServiceClient();

    await settleExpiredChallenges(service);

    if (active) {
      const { data: running } = await service
        .from('ambassador_monthly_challenges')
        .select('id')
        .eq('status', 'active')
        .maybeSingle();

      if (running) return { ok: false, error: 'Un challenge est déjà en cours.' };

      const startsAt = new Date();
      const endsAt = new Date(startsAt);
      endsAt.setMonth(endsAt.getMonth() + 1);

      const { error } = await service
        .from('ambassador_monthly_challenges')
        .insert({
          prize_cents: MONTHLY_CHALLENGE.bonus,
          starts_at: startsAt.toISOString(),
          ends_at: endsAt.toISOString(),
          status: 'active',
          activated_by: user.id,
        });

      if (error) return { ok: false, error: error.message };

      await logAdminAction('ambassadors.monthly_challenge_activated', {
        prizeCents: MONTHLY_CHALLENGE.bonus,
        endsAt: endsAt.toISOString(),
      });
    } else {
      const { error } = await service
        .from('ambassador_monthly_challenges')
        .update({ status: 'canceled' })
        .eq('status', 'active');

      if (error) return { ok: false, error: error.message };

      await logAdminAction('ambassadors.monthly_challenge_canceled', {});
    }

    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur inconnue' };
  }
}

// Ambassador promo codes are a flat 10% discount, generated as FIRSTNAME + "10"
// (e.g. "ALI10"), with a random suffix appended on collision.
const AMBASSADOR_PROMO_PERCENT = 10;

function ambassadorPromoCode(firstName: string, suffix: string): string {
  const base = firstName
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-zA-Z]/g, '')
    .toUpperCase()
    .slice(0, 12) || 'AMBA';
  return `${base}10${suffix}`;
}

/**
 * Creates the ambassador's Stripe-backed promo code, retrying with a random
 * suffix until the code string is free in both our DB and Stripe.
 */
async function provisionAmbassadorPromoCode(
  firstName: string
): Promise<{ ok: true; id: string; code: string } | { ok: false; error: string }> {
  let lastError = 'Création du code promo impossible.';
  for (let attempt = 0; attempt < 5; attempt++) {
    const suffix = attempt === 0
      ? ''
      : crypto.randomBytes(2).toString('hex').toUpperCase().slice(0, 3);
    const code = ambassadorPromoCode(firstName, suffix);
    const res = await createPromoCode({ code, percentageOff: AMBASSADOR_PROMO_PERCENT });
    if (res.ok) return { ok: true, id: res.id, code };
    lastError = res.error;
  }
  return { ok: false, error: lastError };
}

export type ReviewRecruitmentResult =
  | { ok: true; provisioned?: { promoCode: string; setupUrl: string; expiresAt: string } }
  | { ok: false; error: string };

/**
 * Reviews a recruitment application. Rejecting only flips the status.
 * Accepting provisions the whole ambassador account in one click: a 10% promo
 * code, the ambassador record (carrying over the applicant's name, email,
 * phone, SIRET, city and parrain), and a PIN setup link — returned so the
 * admin can send it. Provisioning runs before the status flip, so any failure
 * leaves the application `pending` and retryable; the pending-status guard
 * stops a double-click from provisioning a second account.
 */
export async function reviewRecruitmentApplication(
  id: string,
  status: 'accepted' | 'rejected'
): Promise<ReviewRecruitmentResult> {
  try {
    await requireSuperAdminUser();
    const service = createServiceClient();

    const { data: app } = await service
      .from('ambassador_recruitment_applications')
      .select('id, status, first_name, last_name, email, phone, siret, city, referrer_ambassador_id')
      .eq('id', id)
      .maybeSingle();

    if (!app) return { ok: false, error: 'Candidature introuvable.' };
    if (app.status !== 'pending') return { ok: false, error: 'Cette candidature a déjà été traitée.' };

    if (status === 'rejected') {
      const { error } = await service
        .from('ambassador_recruitment_applications')
        .update({ status: 'rejected', reviewed_at: new Date().toISOString() })
        .eq('id', id)
        .eq('status', 'pending');
      if (error) return { ok: false, error: error.message };
      await logAdminAction('ambassadors.recruitment_rejected', { id });
      return { ok: true };
    }

    const firstName = app.first_name.trim();
    const fullName = `${firstName} ${app.last_name.trim()}`.trim();

    const promo = await provisionAmbassadorPromoCode(firstName);
    if (!promo.ok) return { ok: false, error: `Code promo : ${promo.error}` };

    const created = await createAmbassador({
      name: fullName,
      promoCodeId: promo.id,
      referrerAmbassadorId: app.referrer_ambassador_id ?? null,
      email: app.email,
      phone: app.phone,
      siret: app.siret,
      city: app.city,
    });

    if (!created.ok) {
      // Roll the promo code back so a failed acceptance leaves no orphan
      // Stripe coupon behind.
      await deletePromoCode(promo.id).catch(() => {});
      return { ok: false, error: `Création ambassadeur : ${created.error}` };
    }

    const { error: updErr } = await service
      .from('ambassador_recruitment_applications')
      .update({ status: 'accepted', reviewed_at: new Date().toISOString() })
      .eq('id', id)
      .eq('status', 'pending');
    if (updErr) {
      return { ok: false, error: `Ambassadeur créé, mais statut non mis à jour : ${updErr.message}` };
    }

    await logAdminAction('ambassadors.recruitment_accepted', {
      id,
      ambassadorId: created.id,
      promoCode: promo.code,
    });

    return {
      ok: true,
      provisioned: {
        promoCode: promo.code,
        setupUrl: created.setupUrl,
        expiresAt: created.expiresAt,
      },
    };
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

/**
 * Credits a bonus (a weekly tier bonus or a monthly-challenge win) to an
 * ambassador's withdrawable balance. Bonuses are never automatic — the
 * super-admin reviews each one in the dashboard and releases it here.
 *
 * The bonus is recomputed from the current (non-voided) sales at credit time,
 * so a bonus inflated by sales that were since refunded can never be paid.
 * The UNIQUE (ambassador, kind, period) constraint makes double-credit
 * impossible.
 */
export async function creditBonus(
  ambassadorId: string,
  kind: 'weekly_tier' | 'monthly_challenge',
  periodKey: string
): Promise<{ ok: true; amountCents: number } | { ok: false; error: string }> {
  try {
    await requireSuperAdminUser();
    const service = createServiceClient();

    if (kind !== 'weekly_tier' && kind !== 'monthly_challenge') {
      return { ok: false, error: 'Type de bonus invalide.' };
    }

    let amountCents: number;

    if (kind === 'weekly_tier') {
      const { data: sales } = await service
        .from('ambassador_sales')
        .select('created_at')
        .eq('ambassador_id', ambassadorId)
        .is('voided_at', null);
      const item = computeClosedWeekBonusBreakdown(sales ?? []).find(
        (b) => b.periodKey === periodKey
      );
      if (!item) {
        return { ok: false, error: 'Bonus hebdo introuvable — palier non atteint ou semaine non clôturée.' };
      }
      amountCents = item.bonusCents;
    } else {
      // periodKey is the settled challenge id. The winner is whoever the
      // settlement run recorded; we pay them the challenge's prize.
      const { data: challenge } = await service
        .from('ambassador_monthly_challenges')
        .select('id, status, winner_ambassador_id, prize_cents')
        .eq('id', periodKey)
        .maybeSingle();
      if (!challenge || challenge.status !== 'settled') {
        return { ok: false, error: 'Challenge introuvable ou pas encore clôturé.' };
      }
      if (challenge.winner_ambassador_id !== ambassadorId) {
        return { ok: false, error: 'Cet ambassadeur n\'est pas le gagnant de ce challenge.' };
      }
      amountCents = challenge.prize_cents;
    }

    const { error } = await service.from('ambassador_bonus_credits').insert({
      ambassador_id: ambassadorId,
      kind,
      period_key: periodKey,
      amount_cents: amountCents,
    });

    if (error) {
      if ((error as { code?: string }).code === '23505') {
        return { ok: false, error: 'Ce bonus a déjà été crédité.' };
      }
      return { ok: false, error: error.message };
    }

    await logAdminAction('ambassadors.credit_bonus', {
      ambassadorId, kind, periodKey, amountCents,
    });
    return { ok: true, amountCents };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur inconnue' };
  }
}
