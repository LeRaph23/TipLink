import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

/**
 * Resolve the email addresses of every super admin.
 * Best-effort: returns an empty array on failure rather than throwing,
 * so callers can treat notifications as non-blocking.
 */
export async function getSuperAdminEmails(
  service: SupabaseClient<Database>,
): Promise<string[]> {
  const { data: roles, error } = await service
    .from('user_roles')
    .select('user_id')
    .eq('role', 'super_admin');

  if (error || !roles?.length) return [];

  const emails = await Promise.all(
    roles.map(async (r) => {
      const { data } = await service.auth.admin.getUserById(r.user_id);
      return data.user?.email ?? null;
    }),
  );

  return [...new Set(emails.filter((e): e is string => !!e))];
}
