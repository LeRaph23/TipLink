'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { stripe } from '@/lib/stripe/client';
import { validateIban } from '@/lib/banking/iban';

export interface BankingData {
  firstName: string;
  lastName: string;
  dob: { day: number; month: number; year: number };
  address: { line1: string; city: string; postal_code: string; country: string };
  iban: string;
  email: string;
  tosTimestamp: number;
  ip: string;
}

export async function createCustomStripeAccount(
  staffProfileId: string,
  data: BankingData
): Promise<{ accountId: string } | { error: string }> {
  const ibanResult = validateIban(data.iban);
  if (!ibanResult.ok) {
    return { error: ibanResult.error };
  }
  const country = ibanResult.country;
  const ibanClean = ibanResult.normalized;

  let accountId: string;
  try {
    const account = await stripe.accounts.create({
      type: 'custom',
      country,
      business_type: 'individual',
      individual: {
        first_name: data.firstName,
        last_name: data.lastName,
        dob: { day: data.dob.day, month: data.dob.month, year: data.dob.year },
        address: {
          line1: data.address.line1,
          city: data.address.city,
          postal_code: data.address.postal_code,
          country: data.address.country,
        },
        email: data.email,
      },
      tos_acceptance: { date: data.tosTimestamp, ip: data.ip },
      capabilities: { transfers: { requested: true } },
      settings: { payouts: { schedule: { interval: 'manual' } } },
      metadata: { staff_profile_id: staffProfileId },
    });
    accountId = account.id;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Stripe account creation failed';
    console.error('createCustomStripeAccount: create failed', err);
    return { error: msg };
  }

  try {
    await stripe.accounts.createExternalAccount(accountId, {
      external_account: {
        object: 'bank_account',
        country,
        currency: 'eur',
        account_holder_name: `${data.firstName} ${data.lastName}`,
        account_holder_type: 'individual',
        account_number: ibanClean,
      } as Parameters<typeof stripe.accounts.createExternalAccount>[1]['external_account'],
    });
  } catch (err) {
    // Clean up the account if Stripe rejects the IBAN (rare since we pre-validated)
    await stripe.accounts.del(accountId).catch(() => null);
    const msg = err instanceof Error ? err.message : 'IBAN refusé par Stripe';
    console.error('createCustomStripeAccount: external account failed', err);
    return { error: msg };
  }

  const service = createServiceClient();
  const { error: dbErr } = await service
    .from('staff_profiles')
    .update({ stripe_account_id: accountId, onboarding_status: 'complete' })
    .eq('id', staffProfileId);

  if (dbErr) {
    console.error('createCustomStripeAccount: db update failed', dbErr);
    return { error: dbErr.message };
  }

  return { accountId };
}

// Called from /dashboard/banking when a staff member sets up banking for the first time.
export async function setupStaffBanking(
  data: Omit<BankingData, 'email' | 'ip'>
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  const service = createServiceClient();

  const { data: profile } = await service
    .from('staff_profiles')
    .select('id, stripe_account_id')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .maybeSingle();

  if (!profile) return { error: 'Aucun profil staff trouvé' };
  if (profile.stripe_account_id) return { error: 'Compte bancaire déjà configuré' };

  const headersList = await headers();
  const ip =
    headersList.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    headersList.get('x-real-ip') ??
    '0.0.0.0';

  const result = await createCustomStripeAccount(profile.id, {
    ...data,
    email: user.email ?? '',
    ip,
  });

  if ('error' in result) return { error: result.error };
  return { ok: true };
}

// Called from /dashboard/banking to replace an existing IBAN on a Stripe Custom account.
export async function updateBankAccountIBAN(
  iban: string,
  holderName: string
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  const service = createServiceClient();

  const { data: profile } = await service
    .from('staff_profiles')
    .select('id, stripe_account_id')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .maybeSingle();

  if (!profile?.stripe_account_id) return { error: 'Aucun compte Stripe trouvé' };

  const ibanResult = validateIban(iban);
  if (!ibanResult.ok) return { error: ibanResult.error };

  const accountId = profile.stripe_account_id;
  const ibanClean = ibanResult.normalized;
  const country = ibanResult.country;

  // List existing bank accounts to delete after adding new one
  let oldBankIds: string[] = [];
  try {
    const existing = await stripe.accounts.listExternalAccounts(accountId, {
      object: 'bank_account',
      limit: 10,
    });
    oldBankIds = existing.data.map((b: { id: string }) => b.id);
  } catch {
    // Non-fatal
  }

  // Create new external account
  let newBankId: string;
  try {
    const newBank = await stripe.accounts.createExternalAccount(accountId, {
      external_account: {
        object: 'bank_account',
        country,
        currency: 'eur',
        account_holder_name: holderName,
        account_holder_type: 'individual',
        account_number: ibanClean,
      } as Parameters<typeof stripe.accounts.createExternalAccount>[1]['external_account'],
    });
    newBankId = newBank.id;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'IBAN invalide';
    return { error: msg };
  }

  // Set new bank account as default
  try {
    await stripe.accounts.updateExternalAccount(accountId, newBankId, {
      default_for_currency: true,
    });
  } catch {
    // Non-fatal
  }

  // Delete old bank accounts
  for (const oldId of oldBankIds) {
    await stripe.accounts.deleteExternalAccount(accountId, oldId).catch(() => null);
  }

  revalidatePath('/dashboard/banking');
  return { ok: true };
}

const MIN_PAYOUT_CENTS = 3_000; // 30 €

export async function getStaffStripeBalance(): Promise<
  { available: number; pending: number } | { error: string }
> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  const service = createServiceClient();
  const { data: profile } = await service
    .from('staff_profiles')
    .select('stripe_account_id')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .maybeSingle();

  if (!profile?.stripe_account_id) return { error: 'Aucun compte Stripe trouvé' };

  try {
    const balance = await stripe.balance.retrieve(
      {},
      { stripeAccount: profile.stripe_account_id }
    );
    const available = balance.available.find((b) => b.currency === 'eur')?.amount ?? 0;
    const pending   = balance.pending.find((b) => b.currency === 'eur')?.amount ?? 0;
    return { available, pending };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erreur Stripe';
    console.error('getStaffStripeBalance:', err);
    return { error: msg };
  }
}

// Hold tips for 3 days before staff can withdraw. Covers the window in which
// most disputes/chargebacks arrive, so funds aren't already gone when Stripe
// pulls them back from the platform.
const PAYOUT_HOLD_DAYS = 3;

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
    .select('id, stripe_account_id, payouts_frozen')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .maybeSingle();

  if (!profile?.stripe_account_id) return { error: 'Aucun compte Stripe trouvé' };

  const cutoff = new Date(Date.now() - PAYOUT_HOLD_DAYS * 86_400_000).toISOString();
  // Released: succeeded tips older than the hold window, not refunded.
  // We compute the staff's share as (amount - application_fee_amount), which
  // is what was actually transferred to their connected account.
  const { data: released } = await service
    .from('transactions')
    .select('amount, application_fee_amount, refunded_amount')
    .eq('staff_id', profile.id)
    .in('status', ['succeeded'])
    .lt('succeeded_at', cutoff);

  const releasedCents = (released ?? []).reduce((sum, t) => {
    const tx = t as { amount: number; application_fee_amount: number | null; refunded_amount: number | null };
    const fee = tx.application_fee_amount ?? 0;
    const refunded = tx.refunded_amount ?? 0;
    return sum + Math.max(0, tx.amount - fee - refunded);
  }, 0);

  // Pending: succeeded tips still in hold window.
  const { data: heldRows } = await service
    .from('transactions')
    .select('amount, application_fee_amount, succeeded_at')
    .eq('staff_id', profile.id)
    .in('status', ['succeeded'])
    .gte('succeeded_at', cutoff);

  const pendingCents = (heldRows ?? []).reduce((sum, t) => {
    const tx = t as { amount: number; application_fee_amount: number | null };
    const fee = tx.application_fee_amount ?? 0;
    return sum + Math.max(0, tx.amount - fee);
  }, 0);

  // Earliest hold-release date among currently-held tips.
  let heldUntil: string | null = null;
  for (const r of heldRows ?? []) {
    const succeededAt = (r as { succeeded_at: string | null }).succeeded_at;
    if (!succeededAt) continue;
    const releaseAt = new Date(new Date(succeededAt).getTime() + PAYOUT_HOLD_DAYS * 86_400_000);
    if (!heldUntil || releaseAt < new Date(heldUntil)) {
      heldUntil = releaseAt.toISOString();
    }
  }

  // Subtract payouts already requested/paid for this staff.
  const { data: priorPayouts } = await service
    .from('staff_payouts')
    .select('amount, status')
    .eq('staff_id', profile.id)
    .in('status', ['pending', 'paid', 'in_transit']);

  const alreadyPaidOut = (priorPayouts ?? []).reduce(
    (s, p) => s + ((p as { amount: number }).amount ?? 0),
    0,
  );

  const ourAvailable = Math.max(0, releasedCents - alreadyPaidOut);

  // Cross-check with Stripe's own balance — we cannot pay out more than they
  // have available even if our ledger says otherwise.
  let stripeAvailable = 0;
  try {
    const balance = await stripe.balance.retrieve({}, { stripeAccount: profile.stripe_account_id });
    stripeAvailable = balance.available.find((b) => b.currency === 'eur')?.amount ?? 0;
  } catch (err) {
    console.error('getStaffPayoutAvailability balance lookup failed', err);
  }

  return {
    available: Math.min(ourAvailable, stripeAvailable),
    pending: pendingCents,
    heldUntil,
    frozen: (profile as { payouts_frozen?: boolean }).payouts_frozen === true,
  };
}

export async function requestPayout(): Promise<{ ok: true; amount: number } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  const service = createServiceClient();
  const { data: profile } = await service
    .from('staff_profiles')
    .select('id, stripe_account_id, payouts_frozen')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .maybeSingle();

  if (!profile?.stripe_account_id) return { error: 'Aucun compte Stripe trouvé' };
  if ((profile as { payouts_frozen?: boolean }).payouts_frozen === true) {
    return { error: 'Vos retraits sont temporairement suspendus. Contactez le support.' };
  }

  const accountId = profile.stripe_account_id;

  const availability = await getStaffPayoutAvailability();
  if ('error' in availability) return { error: availability.error };

  if (availability.available < MIN_PAYOUT_CENTS) {
    const heldNote = availability.pending > 0
      ? ` ${(availability.pending / 100).toFixed(2)} € sont en attente de libération (délai de ${PAYOUT_HOLD_DAYS} jours après réception).`
      : '';
    return {
      error: `Solde disponible insuffisant (${(availability.available / 100).toFixed(2)} €). Le minimum pour un virement est de 30 €.${heldNote}`,
    };
  }

  try {
    const payout = await stripe.payouts.create(
      { amount: availability.available, currency: 'eur', method: 'standard' },
      { stripeAccount: accountId }
    );

    await service.from('staff_payouts').insert({
      staff_id: (profile as { id: string }).id,
      stripe_payout_id: payout.id,
      amount: payout.amount,
      status: 'pending',
    } as never);

    return { ok: true, amount: payout.amount };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erreur lors du virement';
    console.error('requestPayout:', err);
    return { error: msg };
  }
}

// Called from OnboardingWizard (postpurchase mode) when the admin wants to receive tips too.
// Creates the admin's staff_profile + Stripe Custom account in one shot.
export async function setupAdminPayments(
  bankingData: Omit<BankingData, 'email' | 'ip'>
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  const service = createServiceClient();

  // Resolve group → establishment
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

  // Upsert staff_profile for the admin
  const { data: existing } = await service
    .from('staff_profiles')
    .select('id, stripe_account_id')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .maybeSingle();

  let staffProfileId: string;

  if (existing) {
    if (existing.stripe_account_id) return { ok: true }; // already set up
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

    // Ensure staff role exists
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

  const headersList = await headers();
  const ip =
    headersList.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    headersList.get('x-real-ip') ??
    '0.0.0.0';

  const result = await createCustomStripeAccount(staffProfileId, {
    ...bankingData,
    email: user.email ?? '',
    ip,
  });

  if ('error' in result) return { error: result.error };
  return { ok: true };
}
