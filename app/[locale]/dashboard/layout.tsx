import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { DashboardShell } from '@/components/dashboard/DashboardShell';

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
  }

  const userName = staffProfile?.full_name ?? (user.user_metadata?.full_name as string | undefined) ?? '';

  return (
    <DashboardShell
      userRoles={roles ?? []}
      userEmail={user.email ?? ''}
      userName={userName}
    >
      {children}
    </DashboardShell>
  );
}
