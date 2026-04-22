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

  const { data: staffProfile } = await supabase
    .from('staff_profiles')
    .select('stripe_account_id')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .single();

  if (!staffProfile?.stripe_account_id) {
    return NextResponse.json(
      { error: 'No Stripe account found. Complete onboarding first.' },
      { status: 404 }
    );
  }

  const accountSession = await stripe.accountSessions.create({
    account: staffProfile.stripe_account_id,
    components: {
      account_onboarding: { enabled: true },
      account_management: { enabled: true },
      notification_banner: { enabled: true },
      balances: { enabled: true },
      payouts: { enabled: true },
    },
  });

  return NextResponse.json({ client_secret: accountSession.client_secret });
}
