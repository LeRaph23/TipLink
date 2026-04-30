'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { logAdminAction } from '@/lib/admin/audit';

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

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

export async function updateGroupFeeBps(
  groupId: string,
  bps: number
): Promise<Result<null>> {
  if (!Number.isFinite(bps) || bps < 0 || bps > 1500) {
    return { ok: false, error: 'Fee must be between 0 and 1500 bps (0%–15%)' };
  }

  const auth = await assertSuperAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };

  const { error } = await auth.supabase
    .from('groups')
    .update({ platform_fee_bps: Math.round(bps) })
    .eq('id', groupId);

  if (error) return { ok: false, error: error.message };

  await logAdminAction('groups.update_fee_bps', { groupId, bps: Math.round(bps) });
  revalidatePath('/dashboard/admin/groups');
  return { ok: true, data: null };
}
