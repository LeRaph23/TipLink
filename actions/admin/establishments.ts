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

export async function updateEstablishment(
  id: string,
  data: { name?: string; address?: string; business_type?: string; country?: string; currency?: string }
): Promise<Result<null>> {
  const auth = await assertSuperAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };

  const patch: Record<string, string> = {};
  if (data.name?.trim()) patch.name = data.name.trim();
  if (data.address?.trim()) patch.address = data.address.trim();
  if (data.business_type?.trim()) patch.business_type = data.business_type.trim();
  if (data.country?.trim()) patch.country = data.country.trim().toUpperCase();
  if (data.currency?.trim()) patch.currency = data.currency.trim().toLowerCase();

  if (!Object.keys(patch).length) return { ok: false, error: 'Nothing to update' };

  const { error } = await auth.supabase
    .from('establishments')
    .update(patch)
    .eq('id', id);

  if (error) return { ok: false, error: error.message };

  await logAdminAction('establishment.update', { id, ...patch });
  revalidatePath('/dashboard/admin/establishments');
  return { ok: true, data: null };
}

export async function deleteEstablishment(id: string): Promise<Result<null>> {
  const auth = await assertSuperAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };

  const { error } = await auth.supabase
    .from('establishments')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);

  if (error) return { ok: false, error: error.message };

  await logAdminAction('establishment.delete', { id });
  revalidatePath('/dashboard/admin/establishments');
  return { ok: true, data: null };
}
