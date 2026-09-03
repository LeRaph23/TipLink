import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { VerifyBanner } from '@/components/dashboard/VerifyBanner';
import { getEstablishmentPayability } from '@/lib/stripe/establishment-account';

export default async function DashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);

  const [{ data: roles }, { data: staffProfile }] = await Promise.all([
    supabase.from('user_roles').select('role, group_id, establishment_id').eq('user_id', user.id),
    supabase.from('staff_profiles').select('full_name').eq('user_id', user.id).is('deleted_at', null).maybeSingle(),
  ]);

  // Safety net: redirect group_admin to onboarding if they haven't completed it yet
  const adminGroupId = roles?.find((r) => r.role === 'group_admin' && r.group_id)?.group_id;
  // Whether the establishment can actually be paid. Read here rather than on
  // the home page so the banner follows the manager everywhere: an account
  // stuck in verification is not news that belongs on one screen they may
  // never open.
  let payability = null;
  if (adminGroupId) {
    const service = createServiceClient();
    const { data: grp } = await service
      .from('groups')
      .select('onboarding_completed_at')
      .eq('id', adminGroupId)
      .maybeSingle();
    if (grp && !grp.onboarding_completed_at) {
      redirect(`/${locale}/onboarding`);
    }
    payability = await getEstablishmentPayability(service, adminGroupId);
  }

  const userName = staffProfile?.full_name ?? (user.user_metadata?.full_name as string | undefined) ?? '';

  return (
    <DashboardShell
      userRoles={roles ?? []}
      userEmail={user.email ?? ''}
      userName={userName}
    >
      {payability && <VerifyBanner payability={payability} locale={locale} />}
      {children}
    </DashboardShell>
  );
}
