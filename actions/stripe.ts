'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { stripe, CONNECT_BUSINESS_PROFILE } from '@/lib/stripe/client';
import { fileToDocument, uploadIdentityDocument } from '@/lib/stripe/identity';

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
  const country = data.iban.replace(/\s/g, '').slice(0, 2).toUpperCase() || 'FR';

  let accountId: string;
  try {
    const account = await stripe.accounts.create({
      type: 'custom',
      country,
      business_type: 'individual',
      business_profile: { ...CONNECT_BUSINESS_PROFILE },
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

  const ibanClean = data.iban.replace(/\s/g, '').toUpperCase();
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
    // Clean up the account if IBAN fails
    await stripe.accounts.del(accountId).catch(() => null);
    const msg = err instanceof Error ? err.message : 'IBAN invalide';
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

  const accountId = profile.stripe_account_id;
  const ibanClean = iban.replace(/\s/g, '').toUpperCase();
  const country = ibanClean.slice(0, 2) || 'FR';

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

export async function requestPayout(): Promise<{ ok: true; amount: number } | { error: string }> {
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

  const accountId = profile.stripe_account_id;

  try {
    const balance = await stripe.balance.retrieve({}, { stripeAccount: accountId });
    const available = balance.available.find((b) => b.currency === 'eur')?.amount ?? 0;

    if (available < MIN_PAYOUT_CENTS) {
      return {
        error: `Solde disponible insuffisant (${(available / 100).toFixed(2)} €). Le minimum pour un virement est de 30 €.`,
      };
    }

    const payout = await stripe.payouts.create(
      { amount: available, currency: 'eur', method: 'standard' },
      { stripeAccount: accountId }
    );

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

// Called from /dashboard/banking when Stripe requests an identity document.
// Lets the staff member upload it without ever leaving the site.
export async function uploadStaffIdentityDocument(
  formData: FormData
): Promise<{ ok: true } | { error: string }> {
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

  const front = await fileToDocument(formData.get('front'));
  if ('error' in front) return { error: front.error };

  const backRaw = formData.get('back');
  let back = null;
  if (backRaw instanceof File && backRaw.size > 0) {
    const parsed = await fileToDocument(backRaw);
    if ('error' in parsed) return { error: parsed.error };
    back = parsed;
  }

  try {
    await uploadIdentityDocument(profile.stripe_account_id, front, back);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Envoi du document échoué';
    console.error('uploadStaffIdentityDocument failed', err);
    return { error: msg };
  }

  revalidatePath('/dashboard/banking');
  return { ok: true };
}
