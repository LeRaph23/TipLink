'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { logAdminAction } from '@/lib/admin/audit';

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

async function assertSuperAdmin(): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Unauthorized' };

  const { data: roles } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id);

  const isSuperAdmin = (roles ?? []).some((r: { role: string }) => r.role === 'super_admin');
  if (!isSuperAdmin) return { ok: false, error: 'Forbidden' };

  return { ok: true };
}

export async function updateEstablishment(
  id: string,
  data: { name?: string; address?: string; business_type?: 'restaurant' | 'beauty'; country?: string; currency?: string }
): Promise<Result<null>> {
  const auth = await assertSuperAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };

  const patch: {
    name?: string;
    address?: string;
    business_type?: 'restaurant' | 'beauty';
    country?: string;
    currency?: string;
  } = {};
  if (data.name?.trim()) patch.name = data.name.trim();
  if (data.address !== undefined) patch.address = data.address.trim();
  if (data.business_type) patch.business_type = data.business_type;
  if (data.country?.trim()) patch.country = data.country.trim().toUpperCase();
  if (data.currency?.trim()) patch.currency = data.currency.trim().toLowerCase();

  if (!Object.keys(patch).length) return { ok: false, error: 'Nothing to update' };

  // Use service client to bypass RLS — super admin already verified above.
  const service = createServiceClient();
  const { error } = await service
    .from('establishments')
    .update(patch)
    .eq('id', id);

  if (error) return { ok: false, error: error.message };

  await logAdminAction('establishment.update', { id, ...patch });
  revalidatePath('/dashboard/admin/establishments');
  revalidatePath(`/dashboard/admin/establishments/${id}`);
  return { ok: true, data: null };
}

export async function setDemoMode(id: string, enabled: boolean): Promise<Result<null>> {
  const auth = await assertSuperAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };

  const service = createServiceClient();
  const { error } = await service
    .from('establishments')
    .update({ is_demo: enabled } as never)
    .eq('id', id);

  if (error) return { ok: false, error: error.message };

  await logAdminAction('establishment.set_demo', { id, enabled });
  revalidatePath('/dashboard/admin/establishments');
  revalidatePath(`/dashboard/admin/establishments/${id}`);
  return { ok: true, data: null };
}

export async function deleteEstablishment(id: string): Promise<Result<null>> {
  const auth = await assertSuperAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };

  const service = createServiceClient();
  const now = new Date().toISOString();

  // 1. Désassigner tous les SmartTags de cet établissement.
  const { error: stickerErr } = await service
    .from('nfc_stickers')
    .update({ establishment_id: null } as never)
    .eq('establishment_id', id);
  if (stickerErr) return { ok: false, error: stickerErr.message };

  // 2. Soft-delete tous les staff_profiles.
  const { error: staffErr } = await service
    .from('staff_profiles')
    .update({ deleted_at: now, is_active: false })
    .eq('establishment_id', id)
    .is('deleted_at', null);
  if (staffErr) return { ok: false, error: staffErr.message };

  // 3. Supprimer les user_roles liés à cet établissement.
  const { error: rolesErr } = await service
    .from('user_roles')
    .delete()
    .eq('establishment_id', id);
  if (rolesErr) return { ok: false, error: rolesErr.message };

  // 4. Soft-delete l'établissement lui-même + libérer le slug pour éviter
  //    la contrainte unique si le même nom est réutilisé plus tard.
  const { error } = await service
    .from('establishments')
    .update({ deleted_at: now, slug: `__deleted__${id}` } as never)
    .eq('id', id);
  if (error) return { ok: false, error: error.message };

  await logAdminAction('establishment.delete', { id });
  revalidatePath('/dashboard/admin/establishments');
  return { ok: true, data: null };
}
