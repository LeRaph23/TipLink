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

  // Fetch the user's roles to determine navigation and access
  const { data: roles } = await supabase
    .from('user_roles')
    .select('role, group_id, establishment_id')
    .eq('user_id', user.id);

  return (
    <div className="min-h-screen flex flex-col">
      <DashboardNav userRoles={roles ?? []} userEmail={user.email ?? ''} />
      <main className="flex-1 container mx-auto px-4 py-8 max-w-5xl">
        {children}
      </main>
    </div>
  );
}
