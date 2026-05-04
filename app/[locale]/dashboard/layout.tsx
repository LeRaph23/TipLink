import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
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
