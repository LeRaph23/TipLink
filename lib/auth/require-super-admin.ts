import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

/**
 * Ensures the current request comes from an authenticated super_admin.
 * Returns the authenticated user's id and the Supabase client for reuse.
 *
 * Non-authenticated visitors get redirected to /login, authenticated
 * users without the super_admin role get a 404 (the admin surface
 * should not acknowledge its existence).
 */
export async function requireSuperAdmin(locale?: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

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
