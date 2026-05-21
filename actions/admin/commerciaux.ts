'use server';

import crypto from 'node:crypto';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { logAdminAction } from '@/lib/admin/audit';
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

export type CreateCommercialInput = {
  name: string;
  companyName: string;
  legalForm: string;
  vrpStatus: string;
  siret: string;
  email: string;
  phone: string;
  city: string;
  sector?: string | null;
  vatNumber?: string | null;
  promoCodeId: string;
};

export type CreateCommercialResult =
  | { ok: true; id: string; setupToken: string; setupUrl: string; expiresAt: string }
  | { ok: false; error: string };

const SETUP_TOKEN_TTL_DAYS = 14;

function generateSetupToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

function buildSetupUrl(promoCode: string, token: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://digitip.app').replace(/\/$/, '');
  return `${base}/fr/pro/${promoCode.toLowerCase()}?setup=${encodeURIComponent(token)}`;
}

export async function createCommercial(
  input: CreateCommercialInput
): Promise<CreateCommercialResult> {
  try {
    await requireSuperAdminUser();
    const service = createServiceClient();

    if (!input.name || input.name.trim().length < 2) {
      return { ok: false, error: 'Nom trop court (min 2 caractères).' };
    }
    if (!input.companyName?.trim()) {
      return { ok: false, error: 'Raison sociale requise.' };
    }
    if (!input.siret?.match(/^\d{14}$/)) {
      return { ok: false, error: 'SIRET invalide (14 chiffres).' };
    }
    if (!input.promoCodeId) {
      return { ok: false, error: 'Code promo requis.' };
    }

    const { data: promoCode } = await service
      .from('promo_codes')
      .select('id, code')
      .eq('id', input.promoCodeId)
      .eq('is_active', true)
      .maybeSingle();
    if (!promoCode) {
      return { ok: false, error: 'Code promo introuvable ou inactif.' };
    }

    // A promo_code may belong to either an ambassador OR a commercial,
    // never both. Guard against double-attribution.
    const [{ data: existingAmb }, { data: existingCom }] = await Promise.all([
      service.from('ambassadors').select('id').eq('promo_code_id', input.promoCodeId).maybeSingle(),
      service.from('commerciaux').select('id').eq('promo_code_id', input.promoCodeId).maybeSingle(),
    ]);
    if (existingAmb || existingCom) {
      return { ok: false, error: 'Ce code promo est déjà lié à un vendeur.' };
    }

    // Flag the promo code as commercial so the Stripe webhook routes the
    // commission to commercial_sales (50/65 €) instead of ambassador_sales.
    await service
      .from('promo_codes')
      .update({ seller_type: 'commercial' })
      .eq('id', input.promoCodeId);

    const id = crypto.randomUUID();
    const setupToken = generateSetupToken();
    const expiresAt = new Date(Date.now() + SETUP_TOKEN_TTL_DAYS * 86400000).toISOString();

    const { data: saved, error: dbErr } = await service
      .from('commerciaux')
      .insert({
        id,
        name: input.name.trim(),
        company_name: input.companyName.trim(),
        legal_form: input.legalForm,
        vrp_status: input.vrpStatus,
        siret: input.siret,
        vat_number: input.vatNumber ?? null,
        sector: input.sector ?? null,
        email: input.email,
        phone: input.phone,
        city: input.city,
        promo_code_id: input.promoCodeId,
        pin_hash: null,
        pin_salt: null,
        pin_setup_token: setupToken,
        pin_setup_expires_at: expiresAt,
        is_active: true,
      })
      .select('id')
      .single();

    if (dbErr || !saved) {
      // Roll back the seller_type flag so the promo code isn't stuck in a half-state.
      try {
        await service.from('promo_codes').update({ seller_type: null }).eq('id', input.promoCodeId);
      } catch { /* best-effort rollback */ }
      return { ok: false, error: `Erreur DB: ${dbErr?.message ?? 'unknown'}` };
    }

    await logAdminAction('commerciaux.create', {
      id: saved.id,
      name: input.name.trim(),
      companyName: input.companyName.trim(),
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
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur inconnue' };
  }
}

// Commercial promo codes: 10% discount, FIRSTNAME + "PRO" + optional suffix
// — distinct from ambassador codes ("FIRSTNAME10") so an admin can read at a
// glance whether a code is ambassador or commercial.
const COMMERCIAL_PROMO_PERCENT = 10;

function commercialPromoCode(firstName: string, suffix: string): string {
  const base = firstName
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-zA-Z]/g, '')
    .toUpperCase()
    .slice(0, 10) || 'PRO';
  return `${base}PRO${suffix}`;
}

async function provisionCommercialPromoCode(
  firstName: string,
): Promise<{ ok: true; id: string; code: string } | { ok: false; error: string }> {
  let lastError = 'Création du code promo impossible.';
  for (let attempt = 0; attempt < 5; attempt++) {
    const suffix = attempt === 0
      ? ''
      : crypto.randomBytes(2).toString('hex').toUpperCase().slice(0, 3);
    const code = commercialPromoCode(firstName, suffix);
    const res = await createPromoCode({ code, percentageOff: COMMERCIAL_PROMO_PERCENT });
    if (res.ok) return { ok: true, id: res.id, code };
    lastError = res.error;
  }
  return { ok: false, error: lastError };
}

export type ReviewCommercialRecruitmentResult =
  | { ok: true; provisioned?: { promoCode: string; setupUrl: string; expiresAt: string } }
  | { ok: false; error: string };

/**
 * Reviews a commercial recruitment application. Rejecting only flips the
 * status. Accepting provisions the whole commercial account in one click:
 * a 10% promo code (tagged seller_type='commercial'), the commercial record
 * with all B2B fields carried over from the application, and a PIN setup link.
 * The pending-status guard makes the operation idempotent across double-clicks.
 */
export async function reviewCommercialRecruitmentApplication(
  id: string,
  status: 'accepted' | 'rejected',
): Promise<ReviewCommercialRecruitmentResult> {
  try {
    await requireSuperAdminUser();
    const service = createServiceClient();

    const { data: app } = await service
      .from('commercial_recruitment_applications')
      .select('id, status, first_name, last_name, email, phone, city, sector, company_name, legal_form, vat_number, siret, vrp_status')
      .eq('id', id)
      .maybeSingle();

    if (!app) return { ok: false, error: 'Candidature introuvable.' };
    if (app.status !== 'pending') return { ok: false, error: 'Cette candidature a déjà été traitée.' };

    if (status === 'rejected') {
      const { error } = await service
        .from('commercial_recruitment_applications')
        .update({ status: 'rejected', reviewed_at: new Date().toISOString() })
        .eq('id', id)
        .eq('status', 'pending');
      if (error) return { ok: false, error: error.message };
      await logAdminAction('commerciaux.recruitment_rejected', { id });
      return { ok: true };
    }

    const firstName = app.first_name.trim();
    const fullName = `${firstName} ${app.last_name.trim()}`.trim();

    const promo = await provisionCommercialPromoCode(firstName);
    if (!promo.ok) return { ok: false, error: `Code promo : ${promo.error}` };

    const created = await createCommercial({
      name: fullName,
      companyName: app.company_name,
      legalForm: app.legal_form,
      vrpStatus: app.vrp_status,
      siret: app.siret,
      vatNumber: app.vat_number,
      sector: app.sector,
      email: app.email,
      phone: app.phone,
      city: app.city,
      promoCodeId: promo.id,
    });

    if (!created.ok) {
      // Roll back the orphan promo code so a failed acceptance leaves no
      // dangling Stripe coupon behind.
      await deletePromoCode(promo.id).catch(() => {});
      return { ok: false, error: `Création commercial : ${created.error}` };
    }

    const { error: updErr } = await service
      .from('commercial_recruitment_applications')
      .update({ status: 'accepted', reviewed_at: new Date().toISOString() })
      .eq('id', id)
      .eq('status', 'pending');
    if (updErr) {
      return { ok: false, error: `Commercial créé, mais statut non mis à jour : ${updErr.message}` };
    }

    await logAdminAction('commerciaux.recruitment_accepted', {
      id,
      commercialId: created.id,
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

export async function toggleCommercial(
  id: string,
  isActive: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await requireSuperAdminUser();
    const service = createServiceClient();

    const { data: com } = await service
      .from('commerciaux')
      .select('name')
      .eq('id', id)
      .maybeSingle();
    if (!com) return { ok: false, error: 'Commercial introuvable.' };

    const { error } = await service
      .from('commerciaux')
      .update({ is_active: isActive })
      .eq('id', id);
    if (error) return { ok: false, error: error.message };

    await logAdminAction(
      isActive ? 'commerciaux.activate' : 'commerciaux.deactivate',
      { id, name: com.name },
    );
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur inconnue' };
  }
}

export async function setCommercialPayoutsFrozen(
  id: string,
  frozen: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await requireSuperAdminUser();
    const service = createServiceClient();

    const { data: com } = await service
      .from('commerciaux')
      .select('name')
      .eq('id', id)
      .maybeSingle();
    if (!com) return { ok: false, error: 'Commercial introuvable.' };

    const { error } = await service
      .from('commerciaux')
      .update({ payouts_frozen: frozen })
      .eq('id', id);
    if (error) return { ok: false, error: error.message };

    await logAdminAction(
      frozen ? 'commerciaux.freeze_payouts' : 'commerciaux.unfreeze_payouts',
      { id, name: com.name },
    );
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur inconnue' };
  }
}

export async function regenerateCommercialSetupToken(
  id: string,
): Promise<{ ok: true; setupUrl: string; expiresAt: string } | { ok: false; error: string }> {
  try {
    await requireSuperAdminUser();
    const service = createServiceClient();

    const { data: com } = await service
      .from('commerciaux')
      .select('id, promo_codes(code)')
      .eq('id', id)
      .maybeSingle();
    if (!com) return { ok: false, error: 'Commercial introuvable.' };

    const promoCode = com.promo_codes as { code?: string } | { code?: string }[] | null;
    const code = Array.isArray(promoCode) ? promoCode[0]?.code : promoCode?.code;
    if (!code) return { ok: false, error: 'Code promo introuvable.' };

    const setupToken = generateSetupToken();
    const expiresAt = new Date(Date.now() + SETUP_TOKEN_TTL_DAYS * 86400000).toISOString();

    const { error } = await service
      .from('commerciaux')
      .update({
        pin_hash: null,
        pin_salt: null,
        pin_setup_token: setupToken,
        pin_setup_expires_at: expiresAt,
      })
      .eq('id', id);
    if (error) return { ok: false, error: error.message };

    await logAdminAction('commerciaux.regenerate_setup_token', { id });
    return { ok: true, setupUrl: buildSetupUrl(code, setupToken), expiresAt };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur inconnue' };
  }
}
