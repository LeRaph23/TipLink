import { redirect } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { OnboardingWizard } from '@/components/onboarding/OnboardingWizard';
import { verifyOnboardingToken } from '@/lib/auth/onboarding-token';

export const dynamic = 'force-dynamic';

export default async function OnboardingPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ tag?: string; code?: string; step?: string; group?: string; email?: string; token?: string }>;
}) {
  const { locale } = await params;
  const { tag, code, group: groupParam, email: emailParam, token } = await searchParams;
  setRequestLocale(locale);

  // NFC scan mode (unauthenticated allowed).
  //
  // `tag` is the parameter the proxy now redirects to; `code` is still read for
  // the links already in circulation. It was renamed because supabase-js treats
  // any `?code=` as a PKCE authorization code once a verifier exists — see
  // lib/supabase/client.ts, where the guard for those old links lives.
  const scanned = tag ?? code;
  if (scanned) {
    return (
      <OnboardingWizard
        mode="scan"
        initialCode={scanned.trim().toLowerCase()}
        locale={locale}
      />
    );
  }

  // Express checkout mode: requires a token signed by the server when the
  // confirmation email was sent. Without it any UUID could trigger the wizard.
  if (groupParam) {
    const verified = verifyOnboardingToken(token, groupParam);
    if (!verified.valid) {
      redirect(`/${locale}/login`);
    }

    const service = createServiceClient();
    const { data: group } = await service
      .from('groups')
      .select('id, onboarding_completed_at')
      .eq('id', groupParam)
      .maybeSingle();

    if (group && !group.onboarding_completed_at) {
      return (
        <OnboardingWizard
          mode="express"
          groupId={group.id}
          initialEmail={verified.email || (emailParam ? decodeURIComponent(emailParam) : '')}
          token={token!}
          locale={locale}
        />
      );
    }

    redirect(`/${locale}/dashboard`);
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
