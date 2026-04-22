import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe/client';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function POST(_request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('staff_profiles')
    .select('id, stripe_account_id')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .single();

  if (!profile) {
    return NextResponse.json({ error: 'Staff profile not found' }, { status: 404 });
  }

  // Idempotent: return existing account if already created
  if (profile.stripe_account_id) {
    return NextResponse.json({ accountId: profile.stripe_account_id });
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

  return NextResponse.json({ accountId: account.id });
}
