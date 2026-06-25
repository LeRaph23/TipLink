'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import type { Database } from '@/types/database';
import { logAdminAction } from '@/lib/admin/audit';

type Result<T> = { ok: true; data: T } | { ok: false; error: string };
type UserRole = Database['public']['Tables']['user_roles']['Row']['role'];

async function assertSuperAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, ok: false as const, error: 'Unauthorized' };

  const { data: roles } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id);

  const isSuperAdmin = (roles ?? []).some((r) => r.role === 'super_admin');
  if (!isSuperAdmin) return { supabase, ok: false as const, error: 'Forbidden' };

  return { supabase, ok: true as const };
}

export type AdminAuthUserRow = {
  id: string;
  email: string | undefined;
  created_at: string;
  last_sign_in_at: string | null;
};

export async function listAuthUsersForAdmin(): Promise<Result<AdminAuthUserRow[]>> {
  const auth = await assertSuperAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };

  const service = createServiceClient();
  const { data, error } = await service.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (error) {
    console.error('[listAuthUsersForAdmin] Supabase auth admin error:', error);
    return { ok: false, error: error.message };
  }

  const rows: AdminAuthUserRow[] = (data.users ?? []).map((u) => ({
    id: u.id,
    email: u.email,
    created_at: u.created_at,
    last_sign_in_at: u.last_sign_in_at ?? null,
  }));
  return { ok: true, data: rows };
}

export async function addUserRole(formData: FormData): Promise<Result<null>> {
  const auth = await assertSuperAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };

  const userId = String(formData.get('user_id') ?? '').trim();
  const role = String(formData.get('role') ?? '').trim() as UserRole;
  const groupId = String(formData.get('group_id') ?? '').trim() || null;
  const establishmentId = String(formData.get('establishment_id') ?? '').trim() || null;

  if (!userId) return { ok: false, error: 'Missing user' };
  const allowed: UserRole[] = ['super_admin', 'group_admin', 'manager', 'staff'];
  if (!allowed.includes(role)) return { ok: false, error: 'Invalid role' };

  if (role === 'super_admin' && (groupId || establishmentId)) {
    return { ok: false, error: 'super_admin must have empty group and establishment' };
  }
  if (role === 'group_admin' && (!groupId || establishmentId)) {
    return { ok: false, error: 'group_admin requires group_id only' };
  }
  if ((role === 'manager' || role === 'staff') && !establishmentId) {
    return { ok: false, error: 'manager/staff require establishment_id' };
  }
  if ((role === 'manager' || role === 'staff') && groupId) {
    return { ok: false, error: 'manager/staff must not set group_id' };
  }

  const { error } = await auth.supabase.from('user_roles').insert({
    user_id: userId,
    role,
    group_id: groupId,
    establishment_id: establishmentId,
  });

  if (error) return { ok: false, error: error.message };

  await logAdminAction('user_role.add', { userId, role, groupId, establishmentId });
  revalidatePath('/dashboard/admin/users');
  return { ok: true, data: null };
}

export async function removeUserRole(roleRowId: string): Promise<Result<null>> {
  const auth = await assertSuperAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };
  if (!roleRowId) return { ok: false, error: 'Missing role id' };

  const { error } = await auth.supabase.from('user_roles').delete().eq('id', roleRowId);
  if (error) return { ok: false, error: error.message };

  await logAdminAction('user_role.remove', { roleRowId });
  revalidatePath('/dashboard/admin/users');
  return { ok: true, data: null };
}

export async function deleteAuthUser(userId: string): Promise<Result<null>> {
  const auth = await assertSuperAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };
  if (!userId) return { ok: false, error: 'Missing user id' };

  const service = createServiceClient();

  // Remove all roles first (FK cleanup)
  await auth.supabase.from('user_roles').delete().eq('user_id', userId);

  const { error } = await service.auth.admin.deleteUser(userId);
  if (error) return { ok: false, error: error.message };

  await logAdminAction('user.delete', { userId });
  revalidatePath('/dashboard/admin/users');
  return { ok: true, data: null };
}
