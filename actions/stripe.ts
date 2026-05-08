'use server';

import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { stripe } from '@/lib/stripe/client';

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
