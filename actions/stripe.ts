'use server';

import { revalidatePath } from 'next/cache';
import { stripe } from '@/lib/stripe/client';
import { createClient } from '@/lib/supabase/server';

export async function createStripeConnectAccount(): Promise<
  { accountId: string } | { error: string }
> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return { error: 'Unauthorized' };

  const { data: profile } = await supabase
    .from('staff_profiles')
    .select('id, stripe_account_id, full_name')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .single();

  if (!profile) return { error: 'Staff profile not found' };

  // Idempotent: return existing account
  if (profile.stripe_account_id) {
    return { accountId: profile.stripe_account_id };
  }

  // Pre-split full_name into first/last for Stripe
  const nameParts = (profile.full_name ?? '').trim().split(/\s+/);
  const firstName = nameParts[0] ?? '';
  const lastName = nameParts.slice(1).join(' ') || firstName;

  let accountId: string;
  try {
    const account = await stripe.accounts.create({
      type: 'express',
      // Pre-set individual so Stripe skips the "type d'entreprise" screen
      business_type: 'individual',
      individual: {
        first_name: firstName || undefined,
        last_name: lastName || undefined,
        email: user.email ?? undefined,
      },
      capabilities: {
        transfers: { requested: true },
      },
      settings: {
        payouts: { schedule: { interval: 'manual' } },
      },
      metadata: { staff_profile_id: profile.id, user_id: user.id },
    });
    accountId = account.id;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Stripe account creation failed';
    console.error('createStripeConnectAccount: stripe.accounts.create failed', err);
    return { error: message };
  }

  const { error: updateErr } = await supabase
    .from('staff_profiles')
    .update({
      stripe_account_id: accountId,
      onboarding_status: 'pending',
    })
    .eq('id', profile.id);

  if (updateErr) {
    console.error('createStripeConnectAccount: failed to persist account id', updateErr);
    return { error: 'Failed to save Stripe account' };
  }

  revalidatePath('/dashboard/onboarding');
  return { accountId };
}
