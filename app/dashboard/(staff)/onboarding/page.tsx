import { createClient } from '@/lib/supabase/server';
import { StripeConnectEmbed } from '@/components/onboarding/StripeConnectEmbed';

export default async function OnboardingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from('staff_profiles')
    .select('stripe_account_id, onboarding_status')
    .eq('user_id', user!.id)
    .is('deleted_at', null)
    .single();

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Payout Account</h1>
        <p className="text-muted-foreground mt-1">
          Set up your bank account to receive tips directly.
        </p>
      </div>
      <StripeConnectEmbed
        hasAccount={!!profile?.stripe_account_id}
        isComplete={profile?.onboarding_status === 'complete'}
        showManagement={profile?.onboarding_status === 'complete'}
      />
    </div>
  );
}
