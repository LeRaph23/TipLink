'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { validateIban } from '@/lib/banking/iban';
import { provisionMangopayAccount } from '@/lib/mangopay/onboarding';
import { createIbanRecipient, getRecipient, deactivateRecipient } from '@/lib/mangopay/recipients';
import { createTransfer } from '@/lib/mangopay/transfers';
import { createPayOut } from '@/lib/mangopay/payouts';
import { platformIds } from '@/lib/mangopay/client';
import { fileToDocument, submitIdentityProof } from '@/lib/mangopay/kyc';
import { getBaseUrl } from '@/lib/env';

type Service = ReturnType<typeof createServiceClient>;

export interface BankingData {
  firstName: string;
  lastName: string;
  dob: { day: number; month: number; year: number };
  address: { line1: string; city: string; postal_code: string; country: string };
  iban: string;
  bic?: string;
  // ISO 3166-1 alpha-2. Defaults to the address country when the form omits it.
  nationality?: string;
}

// Staff withdrawal minimum — 40 € (was 30 € on Stripe).
const MIN_PAYOUT_CENTS = 4_000;
// Hold tips for 3 days before they can be withdrawn — covers the window in
// which most chargebacks arrive.
const PAYOUT_HOLD_DAYS = 3;

// The SCA hosted session sends the user back here once enrollment completes.
function scaReturnUrl(): string {
  return `${getBaseUrl()}/dashboard/banking?sca=return`;
}

function appendReturnUrl(redirectUrl: string, returnUrl: string): string {
  const sep = redirectUrl.includes('?') ? '&' : '?';
  return `${redirectUrl}${sep}returnUrl=${encodeURIComponent(returnUrl)}`;
}

// ─── Onboarding (Phase 5) ─────────────────────────────────────────────────────

// Creates the Mangopay side of a staff member's account: an OWNER Natural User,
// an EUR wallet, and a PAYOUT Recipient for the IBAN. A PAYOUT Recipient
// requires SCA — registering it returns a hosted-session RedirectUrl that the
// browser must open to finish onboarding. Completing that session activates
// the Recipient and records the staff member's SCA presence, which the
// USER_NOT_PRESENT withdrawal transfers rely on.
export async function createStaffMangopayAccount(
  staffProfileId: string,
  data: BankingData,
  email: string
): Promise<{ ok: true; scaRedirectUrl: string | null } | { error: string }> {
  const result = await provisionMangopayAccount({
    firstName: data.firstName,
    lastName: data.lastName,
    email,
    dob: data.dob,
    address: data.address,
    iban: data.iban,
    bic: data.bic,
    nationality: data.nationality,
    walletDescription: `TipLink — ${data.firstName} ${data.lastName}`,
  });
  if (!result.ok) return { error: result.error };

  const service = createServiceClient();
  const { error: dbErr } = await service
    .from('staff_profiles')
    .update({
      mangopay_user_id: result.userId,
      mangopay_wallet_id: result.walletId,
      mangopay_recipient_id: result.recipientId,
      onboarding_status: 'pending',
    })
    .eq('id', staffProfileId);
  if (dbErr) {
    console.error('createStaffMangopayAccount: db update failed', dbErr);
    return { error: dbErr.message };
  }

  return {
    ok: true,
    scaRedirectUrl: result.scaRedirectUrl
      ? appendReturnUrl(result.scaRedirectUrl, scaReturnUrl())
      : null,
  };
}

// Called from /dashboard/banking when a staff member first sets up banking.
export async function setupStaffBanking(
  data: BankingData
): Promise<{ ok: true; scaRedirectUrl: string | null } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  const service = createServiceClient();
  const { data: profile } = await service
    .from('staff_profiles')
    .select('id, mangopay_user_id')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .maybeSingle();

  if (!profile) return { error: 'Aucun profil staff trouvé' };
  if (profile.mangopay_user_id) return { error: 'Compte bancaire déjà configuré' };

  const result = await createStaffMangopayAccount(profile.id, data, user.email ?? '');
  if ('error' in result) return result;

  revalidatePath('/dashboard/banking');
  return result;
}

// Replaces the IBAN on an existing account: registers a fresh Recipient
// (another SCA session) reusing the current holder name/address, then
// deactivates the previous Recipient.
export async function updateBankAccountIBAN(
  iban: string,
  fullName: string
): Promise<{ ok: true; scaRedirectUrl: string | null } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  const service = createServiceClient();
  const { data: profile } = await service
    .from('staff_profiles')
    .select('id, mangopay_user_id, mangopay_recipient_id')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .maybeSingle();

  if (!profile?.mangopay_user_id || !profile.mangopay_recipient_id) {
    return { error: 'Aucun compte Mangopay trouvé' };
  }

  const ibanResult = validateIban(iban);
  if (!ibanResult.ok) return { error: ibanResult.error };

  const oldRecipientId = profile.mangopay_recipient_id;
  const nameParts = fullName.trim().split(/\s+/);
  const firstName = nameParts[0] ?? '';
  const lastName = nameParts.slice(1).join(' ') || firstName;

  let newRecipientId: string;
  let scaRedirect: string | null = null;
  try {
    // Reuse the existing Recipient's holder address — the update form only
    // collects a new IBAN.
    const old = await getRecipient(oldRecipientId);
    const oldAddr = old.IndividualRecipient?.Address;
    const recipient = await createIbanRecipient({
      userId: profile.mangopay_user_id,
      displayName: fullName,
      firstName,
      lastName,
      iban: ibanResult.normalized,
      country: ibanResult.country,
      address: {
        addressLine1: oldAddr?.AddressLine1 ?? '',
        city: oldAddr?.City ?? '',
        postalCode: oldAddr?.PostalCode ?? '',
        country: (oldAddr?.Country ?? ibanResult.country) as string,
      },
      scaContext: 'USER_PRESENT',
    });
    newRecipientId = recipient.Id;
    scaRedirect = recipient.PendingUserAction?.RedirectUrl ?? null;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'IBAN refusé par Mangopay';
    return { error: msg };
  }

  const { error: dbErr } = await service
    .from('staff_profiles')
    .update({ mangopay_recipient_id: newRecipientId })
    .eq('id', profile.id);
  if (dbErr) return { error: dbErr.message };

  if (oldRecipientId !== newRecipientId) {
    await deactivateRecipient(oldRecipientId).catch(() => null);
  }

  revalidatePath('/dashboard/banking');
  return {
    ok: true,
    scaRedirectUrl: scaRedirect ? appendReturnUrl(scaRedirect, scaReturnUrl()) : null,
  };
}

// Called on return from the hosted SCA session. Marks the staff member's SCA
// consent recorded once the Recipient is active.
export async function finalizeOnboardingSca(): Promise<
  { ok: true; recipientActive: boolean } | { error: string }
> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  const service = createServiceClient();
  const { data: profile } = await service
    .from('staff_profiles')
    .select('id, mangopay_recipient_id, mangopay_kyc_status')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .maybeSingle();
  if (!profile?.mangopay_recipient_id) return { error: 'Aucun compte Mangopay trouvé' };

  let recipientActive = false;
  try {
    const recipient = await getRecipient(profile.mangopay_recipient_id);
    recipientActive = recipient.Status === 'ACTIVE';
  } catch (err) {
    console.error('finalizeOnboardingSca: recipient lookup failed', err);
  }

  await service
    .from('staff_profiles')
    .update({
      mangopay_sca_enrolled: true,
      // Onboarding is complete once KYC is also validated; the KYC webhook
      // promotes 'pending' -> 'complete'.
      onboarding_status: profile.mangopay_kyc_status === 'validated' ? 'complete' : 'pending',
    })
    .eq('id', profile.id);

  revalidatePath('/dashboard/banking');
  return { ok: true, recipientActive };
}

// Onboarding wizard (post-purchase): creates the admin's own staff_profile and
// Mangopay account so they can receive tips too.
export async function setupAdminPayments(
  data: BankingData
): Promise<{ ok: true; scaRedirectUrl: string | null } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  const service = createServiceClient();

  const { data: roleRow } = await service
    .from('user_roles')
    .select('group_id')
    .eq('user_id', user.id)
    .in('role', ['group_admin', 'super_admin'])
    .not('group_id', 'is', null)
    .limit(1)
    .maybeSingle();
  if (!roleRow?.group_id) return { error: 'No group found' };

  const { data: est } = await service
    .from('establishments')
    .select('id')
    .eq('group_id', roleRow.group_id)
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle();
  if (!est) return { error: 'No establishment found' };

  const { data: existing } = await service
    .from('staff_profiles')
    .select('id, mangopay_user_id')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .maybeSingle();

  let staffProfileId: string;
  if (existing) {
    if (existing.mangopay_user_id) return { ok: true, scaRedirectUrl: null };
    staffProfileId = existing.id;
  } else {
    const fullName =
      (user.user_metadata?.full_name as string | undefined)?.trim() ||
      user.email?.split('@')[0] ||
      'Admin';
    const { data: newProfile, error: insertErr } = await service
      .from('staff_profiles')
      .insert({
        user_id: user.id,
        establishment_id: est.id,
        full_name: fullName,
        is_active: true,
        onboarding_status: 'not_started',
      })
      .select('id')
      .single();
    if (insertErr || !newProfile) return { error: insertErr?.message ?? 'Profile insert failed' };
    staffProfileId = newProfile.id;

    const { data: existingRole } = await service
      .from('user_roles')
      .select('id')
      .eq('user_id', user.id)
      .eq('establishment_id', est.id)
      .maybeSingle();
    if (!existingRole) {
      await service.from('user_roles').insert({
        user_id: user.id,
        role: 'staff',
        establishment_id: est.id,
      });
    }
  }

  return createStaffMangopayAccount(staffProfileId, data, user.email ?? '');
}

// Submits an identity proof for KYC validation (replaces the Stripe Identity
// document upload). The KYC webhook later promotes the status.
export async function uploadStaffIdentityDocument(
  formData: FormData
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  const service = createServiceClient();
  const { data: profile } = await service
    .from('staff_profiles')
    .select('id, mangopay_user_id')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .maybeSingle();
  if (!profile?.mangopay_user_id) return { error: 'Aucun compte Mangopay trouvé' };

  const front = await fileToDocument(formData.get('front'));
  if ('error' in front) return { error: front.error };

  let back = null;
  const backRaw = formData.get('back');
  if (backRaw instanceof File && backRaw.size > 0) {
    const parsed = await fileToDocument(backRaw);
    if ('error' in parsed) return { error: parsed.error };
    back = parsed;
  }

  try {
    await submitIdentityProof(profile.mangopay_user_id, front, back);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Envoi du document échoué';
    console.error('uploadStaffIdentityDocument failed', err);
    return { error: msg };
  }

  await service
    .from('staff_profiles')
    .update({ mangopay_kyc_status: 'pending' })
    .eq('id', profile.id);

  revalidatePath('/dashboard/banking');
  return { ok: true };
}

// ─── Balance & withdrawal (Phase 6) ───────────────────────────────────────────

type Availability = { available: number; pending: number; heldUntil: string | null };

// The staff balance is a pure internal ledger: the money sits in the central
// wallet and each staff member's share is the sum of their succeeded solo tips
// (net of fees/refunds) plus their group-tip ledger lines, minus prior payouts.
async function computeAvailability(service: Service, staffId: string): Promise<Availability> {
  const cutoff = new Date(Date.now() - PAYOUT_HOLD_DAYS * 86_400_000).toISOString();

  let released = 0;
  let pending = 0;
  let heldUntil: string | null = null;

  const consider = (net: number, ts: string | null): void => {
    if (net <= 0) return;
    if (ts && ts < cutoff) {
      released += net;
      return;
    }
    pending += net;
    if (ts) {
      const releaseAt = new Date(new Date(ts).getTime() + PAYOUT_HOLD_DAYS * 86_400_000).toISOString();
      if (!heldUntil || releaseAt < heldUntil) heldUntil = releaseAt;
    }
  };

  const { data: soloTips } = await service
    .from('transactions')
    .select('amount, platform_fee_amount, refunded_amount, succeeded_at')
    .eq('staff_id', staffId)
    .eq('status', 'succeeded');
  for (const t of soloTips ?? []) {
    consider(
      Math.max(0, t.amount - (t.platform_fee_amount ?? 0) - (t.refunded_amount ?? 0)),
      t.succeeded_at
    );
  }

  const { data: groupShares } = await service
    .from('group_tip_transfers')
    .select('amount, created_at')
    .eq('staff_id', staffId)
    .eq('status', 'succeeded')
    .is('reversed_at', null);
  for (const g of groupShares ?? []) {
    consider(g.amount, g.created_at);
  }

  const { data: priorPayouts } = await service
    .from('staff_payouts')
    .select('amount, status')
    .eq('staff_id', staffId)
    .in('status', ['pending', 'paid']);
  const alreadyPaidOut = (priorPayouts ?? []).reduce((s, p) => s + (p.amount ?? 0), 0);

  return { available: Math.max(0, released - alreadyPaidOut), pending, heldUntil };
}

export async function getStaffBalance(): Promise<
  { available: number; pending: number } | { error: string }
> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  const service = createServiceClient();
  const { data: profile } = await service
    .from('staff_profiles')
    .select('id')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .maybeSingle();
  if (!profile) return { error: 'Aucun profil staff trouvé' };

  const { available, pending } = await computeAvailability(service, profile.id);
  return { available, pending };
}

export async function getStaffPayoutAvailability(): Promise<
  | { available: number; pending: number; heldUntil: string | null; frozen: boolean }
  | { error: string }
> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  const service = createServiceClient();
  const { data: profile } = await service
    .from('staff_profiles')
    .select('id, payouts_frozen')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .maybeSingle();
  if (!profile) return { error: 'Aucun profil staff trouvé' };

  const { available, pending, heldUntil } = await computeAvailability(service, profile.id);
  return { available, pending, heldUntil, frozen: profile.payouts_frozen === true };
}

type StaffPayoutProfile = {
  id: string;
  mangopay_user_id: string | null;
  mangopay_wallet_id: string | null;
  mangopay_recipient_id: string | null;
  mangopay_kyc_status: string;
  mangopay_sca_enrolled: boolean;
  payouts_frozen: boolean;
};

// Runs the PayOut leg for a withdrawal whose central->wallet Transfer already
// succeeded (the funds are already in the staff wallet — never re-transfer).
async function resumePayOut(
  service: Service,
  profile: StaffPayoutProfile,
  row: { id: string; amount: number }
): Promise<{ ok: true; amount: number } | { error: string }> {
  try {
    const payOut = await createPayOut({
      authorId: profile.mangopay_user_id!,
      debitedWalletId: profile.mangopay_wallet_id!,
      recipientId: profile.mangopay_recipient_id!,
      amount: row.amount,
      bankWireRef: 'TIPLINK',
      tag: `payout:${profile.id}`,
    });
    await service
      .from('staff_payouts')
      .update({ status: 'pending', mangopay_payout_id: payOut.Id, failure_message: null })
      .eq('id', row.id);
    return { ok: true, amount: row.amount };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Virement bancaire échoué';
    return { error: `Le virement bancaire a de nouveau échoué : ${msg}` };
  }
}

// Two-leg withdrawal: Transfer (central wallet -> staff wallet, SCA
// USER_NOT_PRESENT) then PayOut (staff wallet -> Recipient IBAN, SCA-exempt).
export async function requestPayout(): Promise<
  { ok: true; amount: number } | { error: string }
> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  const service = createServiceClient();
  const { data: profile } = await service
    .from('staff_profiles')
    .select(
      'id, mangopay_user_id, mangopay_wallet_id, mangopay_recipient_id, mangopay_kyc_status, mangopay_sca_enrolled, payouts_frozen'
    )
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .maybeSingle<StaffPayoutProfile>();

  if (!profile) return { error: 'Aucun profil staff trouvé' };
  if (!profile.mangopay_user_id || !profile.mangopay_wallet_id || !profile.mangopay_recipient_id) {
    return { error: 'Votre configuration bancaire est incomplète.' };
  }
  if (profile.mangopay_kyc_status !== 'validated') {
    return { error: "Votre identité n'a pas encore été validée. Le retrait sera possible ensuite." };
  }
  if (!profile.mangopay_sca_enrolled) {
    return { error: 'Vérification de sécurité non terminée. Reconfigurez vos coordonnées bancaires.' };
  }
  if (profile.payouts_frozen) {
    return { error: 'Vos retraits sont temporairement suspendus. Contactez le support.' };
  }

  // A withdrawal already in flight — refuse a second one.
  const { data: inProgress } = await service
    .from('staff_payouts')
    .select('id')
    .eq('staff_id', profile.id)
    .eq('status', 'pending')
    .limit(1);
  if (inProgress && inProgress.length > 0) {
    return { error: 'Un virement est déjà en cours de traitement.' };
  }

  // A prior attempt whose Transfer leg succeeded but PayOut failed — resume
  // from the PayOut so the funds are not transferred twice.
  const { data: stuck } = await service
    .from('staff_payouts')
    .select('id, amount')
    .eq('staff_id', profile.id)
    .eq('status', 'failed')
    .not('mangopay_transfer_id', 'is', null)
    .is('mangopay_payout_id', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (stuck) {
    return resumePayOut(service, profile, stuck);
  }

  const availability = await computeAvailability(service, profile.id);
  if (availability.available < MIN_PAYOUT_CENTS) {
    const heldNote =
      availability.pending > 0
        ? ` ${(availability.pending / 100).toFixed(2)} € sont en attente de libération (délai de ${PAYOUT_HOLD_DAYS} jours).`
        : '';
    return {
      error: `Solde disponible insuffisant (${(availability.available / 100).toFixed(2)} €). Le minimum pour un virement est de 40 €.${heldNote}`,
    };
  }
  const amount = availability.available;
  const { walletId: centralWalletId, userId: platformUserId } = platformIds();

  // Leg 1 — Transfer central wallet -> staff wallet (SCA USER_NOT_PRESENT,
  // covered by the consent given during onboarding enrollment).
  let transferId: string;
  try {
    const transfer = await createTransfer({
      authorId: platformUserId,
      creditedUserId: profile.mangopay_user_id,
      debitedWalletId: centralWalletId,
      creditedWalletId: profile.mangopay_wallet_id,
      amount,
      scaContext: 'USER_NOT_PRESENT',
      tag: `payout:${profile.id}`,
    });
    if (transfer.Status !== 'SUCCEEDED') {
      console.error('requestPayout: transfer not succeeded', transfer.Status, transfer.ResultMessage);
      return { error: "Le transfert interne n'a pas abouti. Réessayez plus tard." };
    }
    transferId = transfer.Id;
  } catch (err) {
    console.error('requestPayout: transfer failed', err);
    return { error: "Le virement n'a pas pu être initié. Réessayez plus tard." };
  }

  // Leg 2 — PayOut staff wallet -> Recipient IBAN (SCA-exempt).
  try {
    const payOut = await createPayOut({
      authorId: profile.mangopay_user_id,
      debitedWalletId: profile.mangopay_wallet_id,
      recipientId: profile.mangopay_recipient_id,
      amount,
      bankWireRef: 'TIPLINK',
      tag: `payout:${profile.id}`,
    });
    await service.from('staff_payouts').insert({
      staff_id: profile.id,
      amount,
      status: 'pending',
      mangopay_transfer_id: transferId,
      mangopay_payout_id: payOut.Id,
    });
    return { ok: true, amount };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Virement bancaire échoué';
    // The funds reached the staff wallet — record the transfer so a retry
    // resumes from the PayOut leg instead of transferring again.
    await service.from('staff_payouts').insert({
      staff_id: profile.id,
      amount,
      status: 'failed',
      mangopay_transfer_id: transferId,
      mangopay_payout_id: null,
      failure_message: msg,
    });
    console.error('requestPayout: payout failed after transfer', err);
    return {
      error: 'Les fonds ont été transférés mais le virement bancaire a échoué. Réessayez : il reprendra automatiquement.',
    };
  }
}
