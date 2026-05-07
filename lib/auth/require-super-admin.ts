import { notFound, redirect } from 'next/navigation';
import { getAuthUser } from './get-auth-user';

// getAuthUser is React.cache'd — reuses the getUser() result already fetched
// by the parent dashboard layout in the same render tree (zero extra round-trip).
export async function requireSuperAdmin(locale?: string) {
  const { supabase, user } = await getAuthUser();

  if (!user) {
    const prefix = locale ? `/${locale}` : '';
    redirect(`${prefix}/login`);
  }

  const { data: roles } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id);

  const isSuperAdmin = (roles ?? []).some((r) => r.role === 'super_admin');
  if (!isSuperAdmin) {
    notFound();
  }

  return { supabase, userId: user.id };
}
