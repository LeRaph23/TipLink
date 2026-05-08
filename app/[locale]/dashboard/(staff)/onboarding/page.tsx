import { getTranslations, setRequestLocale } from 'next-intl/server';
import dynamic from 'next/dynamic';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

// Dynamic import with ssr:false prevents @stripe/connect-js from being evaluated
// on the server where it would try to access browser globals and crash.
const StripeConnectEmbed = dynamic(
  () => import('@/components/onboarding/StripeConnectEmbed').then((m) => m.StripeConnectEmbed),
  { ssr: false }
);

export default async function OnboardingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('dashboard.onboarding');

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);

  const { data: profile } = await supabase
    .from('staff_profiles')
    .select('stripe_account_id, onboarding_status')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .maybeSingle();

  return (
    <div style={{ maxWidth: 520 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 19, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.03em' }}>
          {t('title')}
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 3, lineHeight: 1.6 }}>
          {t('subtitle')}
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
