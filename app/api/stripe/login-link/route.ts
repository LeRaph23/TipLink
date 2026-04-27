import { NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe/client';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('staff_profiles')
    .select('stripe_account_id, onboarding_status')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .maybeSingle();

  if (!profile?.stripe_account_id || profile.onboarding_status !== 'complete') {
    return NextResponse.json({ error: 'Stripe account not ready' }, { status: 400 });
  }

  const loginLink = await stripe.accounts.createLoginLink(profile.stripe_account_id);
  return NextResponse.json({ url: loginLink.url });
}
