import { createClient } from '@/lib/supabase/server';

export type ManageScope = {
  userId: string;
  isSuperAdmin: boolean;
  groupIds: string[];
};

// Resolves every group the authenticated caller may administer, plus whether
// they hold the global super_admin role.
//
// Server actions that mutate group- or establishment-scoped rows through the
// service client (which bypasses RLS) MUST gate on this — with the service
// client there is no database-level policy left to catch a cross-tenant write.
export async function getManageScope(): Promise<ManageScope | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: roles } = await supabase
    .from('user_roles')
    .select('role, group_id')
    .eq('user_id', user.id);

  const isSuperAdmin = (roles ?? []).some((r) => r.role === 'super_admin');
  const groupIds = (roles ?? [])
    .filter((r) => (r.role === 'group_admin' || r.role === 'super_admin') && r.group_id)
    .map((r) => r.group_id as string);

  return { userId: user.id, isSuperAdmin, groupIds: [...new Set(groupIds)] };
}

// True when the caller may manage the given group (owns it, or is super_admin).
export function canManageGroup(scope: ManageScope, groupId: string): boolean {
  return scope.isSuperAdmin || scope.groupIds.includes(groupId);
}
