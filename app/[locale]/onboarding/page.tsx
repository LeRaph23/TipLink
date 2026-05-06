import { redirect } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { OnboardingWizard } from '@/components/onboarding/OnboardingWizard';

export const dynamic = 'force-dynamic';

export default async function OnboardingPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ code?: string; step?: string }>;
}) {
  const { locale } = await params;
  const { code } = await searchParams;
  setRequestLocale(locale);

  // NFC scan mode (unauthenticated allowed)
  if (code) {
    return (
      <OnboardingWizard
        mode="scan"
        initialCode={code.trim().toUpperCase()}
        locale={locale}
      />
    );
  }

  // Post-purchase mode: must be authenticated group_admin
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/${locale}/login`);
  }

  const service = createServiceClient();

  const { data: roleRow } = await service
    .from('user_roles')
    .select('group_id')
    .eq('user_id', user.id)
    .eq('role', 'group_admin')
    .not('group_id', 'is', null)
    .limit(1)
    .maybeSingle();

  if (!roleRow?.group_id) {
    redirect(`/${locale}/dashboard`);
  }

  const { data: group } = await service
    .from('groups')
    .select('id, name, onboarding_completed_at')
    .eq('id', roleRow.group_id)
    .single();

  if (!group) {
    redirect(`/${locale}/dashboard`);
  }

  // Already onboarded
  if (group.onboarding_completed_at) {
    redirect(`/${locale}/dashboard`);
  }

  const { data: est } = await service
    .from('establishments')
    .select('id, name, address')
    .eq('group_id', group.id)
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle();

  return (
    <OnboardingWizard
      mode="postpurchase"
      locale={locale}
      establishment={est ? { id: est.id, name: est.name ?? '', address: est.address ?? '' } : null}
      groupId={group.id}
    />
  );
}
