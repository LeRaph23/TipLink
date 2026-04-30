'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { logAdminAction } from '@/lib/admin/audit';
import { nanoid } from '@/lib/nfc/nanoid';

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

function makeBatchLabel(): string {
  const d = new Date();
  const ymd = d.toISOString().slice(0, 10);
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${ymd}-${suffix}`;
}

export async function generateBatch(
  count: number,
  label?: string
): Promise<Result<{ batch_label: string; short_ids: string[] }>> {
  if (!Number.isFinite(count) || count < 1 || count > 5000) {
    return { ok: false, error: 'Count must be between 1 and 5000' };
  }
  const auth = await assertSuperAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };

  const batchLabel = (label && label.trim()) || makeBatchLabel();

  const rows = Array.from({ length: count }).map(() => ({
    short_id: nanoid(),
    batch_label: batchLabel,
  }));

  const { data, error } = await auth.supabase
    .from('nfc_stickers')
    .insert(rows)
    .select('short_id');

  if (error) return { ok: false, error: error.message };

  await logAdminAction('smarttags.generate_batch', { count, batch_label: batchLabel });
  revalidatePath('/dashboard/admin/smarttags');
  return { ok: true, data: { batch_label: batchLabel, short_ids: (data ?? []).map((r) => r.short_id) } };
}

export async function assignTagsToEstablishment(
  stickerIds: string[],
  establishmentId: string
): Promise<Result<{ updated: number }>> {
  const auth = await assertSuperAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };
  if (!stickerIds.length) return { ok: false, error: 'No tags selected' };

  const { data: est } = await auth.supabase
    .from('establishments')
    .select('id')
    .eq('id', establishmentId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!est) return { ok: false, error: 'Establishment not found' };

  const { data, error } = await auth.supabase
    .from('nfc_stickers')
    .update({ establishment_id: establishmentId })
    .in('id', stickerIds)
    .select('id');

  if (error) return { ok: false, error: error.message };

  await logAdminAction('smarttags.assign', { count: (data ?? []).length, establishmentId });
  revalidatePath('/dashboard/admin/smarttags');
  return { ok: true, data: { updated: (data ?? []).length } };
}

export async function assignTagsByShortIdRange(
  firstShortId: string,
  lastShortId: string,
  establishmentId: string
): Promise<Result<{ updated: number }>> {
  const auth = await assertSuperAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };

  const first = firstShortId.trim();
  const last = lastShortId.trim();
  if (!first || !last) return { ok: false, error: 'Provide both short_ids' };

  // Resolve both tags, ensuring they share a batch_label so the range
  // is unambiguous (prevents crossing factory batches).
  const { data: anchors } = await auth.supabase
    .from('nfc_stickers')
    .select('id, short_id, batch_label, generated_at')
    .in('short_id', [first, last]);

  if (!anchors || anchors.length !== 2) {
    return { ok: false, error: 'Could not resolve both short_ids' };
  }
  const [a, b] = anchors;
  if (!a.batch_label || a.batch_label !== b.batch_label) {
    return { ok: false, error: 'The two tags must belong to the same batch' };
  }

  const lo = new Date(a.generated_at) <= new Date(b.generated_at) ? a.generated_at : b.generated_at;
  const hi = new Date(a.generated_at) >= new Date(b.generated_at) ? a.generated_at : b.generated_at;

  const { data, error } = await auth.supabase
    .from('nfc_stickers')
    .update({ establishment_id: establishmentId })
    .eq('batch_label', a.batch_label)
    .is('establishment_id', null)
    .gte('generated_at', lo)
    .lte('generated_at', hi)
    .select('id');

  if (error) return { ok: false, error: error.message };

  await logAdminAction('smarttags.assign_range', { updated: (data ?? []).length, establishmentId });
  revalidatePath('/dashboard/admin/smarttags');
  return { ok: true, data: { updated: (data ?? []).length } };
}

export async function unassignTag(stickerId: string): Promise<Result<null>> {
  const auth = await assertSuperAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };

  const { error } = await auth.supabase
    .from('nfc_stickers')
    .update({ establishment_id: null })
    .eq('id', stickerId);

  if (error) return { ok: false, error: error.message };

  await logAdminAction('smarttags.unassign', { stickerId });
  revalidatePath('/dashboard/admin/smarttags');
  return { ok: true, data: null };
}

export async function deleteStockTag(stickerId: string): Promise<Result<null>> {
  const auth = await assertSuperAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };

  const { error } = await auth.supabase
    .from('nfc_stickers')
    .delete()
    .eq('id', stickerId)
    .is('establishment_id', null);

  if (error) return { ok: false, error: error.message };

  await logAdminAction('smarttags.delete_stock', { stickerId });
  revalidatePath('/dashboard/admin/smarttags');
  return { ok: true, data: null };
}
