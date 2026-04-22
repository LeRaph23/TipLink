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
    .select('id, stripe_account_id')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .single();

  if (!profile) return { error: 'Staff profile not found' };

  // Idempotent: return existing account
  if (profile.stripe_account_id) {
    return { accountId: profile.stripe_account_id };
  }

  const account = await stripe.accounts.create({
    type: 'express',
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
  });

  await supabase
    .from('staff_profiles')
    .update({
      stripe_account_id: account.id,
      onboarding_status: 'pending',
    })
    .eq('id', profile.id);

  revalidatePath('/dashboard/onboarding');
  return { accountId: account.id };
}
