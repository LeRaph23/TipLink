import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { DashboardNav } from '@/components/dashboard/DashboardNav';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [{ data: roles }, { data: staffProfile }] = await Promise.all([
    supabase.from('user_roles').select('role, group_id, establishment_id').eq('user_id', user.id),
    supabase.from('staff_profiles').select('full_name').eq('user_id', user.id).is('deleted_at', null).maybeSingle(),
  ]);

  const userName = staffProfile?.full_name ?? (user.user_metadata?.full_name as string | undefined) ?? '';

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--bg)' }}>
      <DashboardNav
        userRoles={roles ?? []}
        userEmail={user.email ?? ''}
        userName={userName}
      />
      <main style={{ flex: 1, overflowY: 'auto', background: 'var(--bg)' }}>
        <div className="fade-up" style={{ padding: '36px 40px', maxWidth: 1080 }}>
          {children}
        </div>
      </main>
    </div>
  );
}
