'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getTranslations } from 'next-intl/server';
import { sendStaffInviteLink } from '@/lib/staff-invite';
import { actionError, classifyDbError } from '@/lib/errors/action-error';

interface CreateStaffInput {
  fullName: string;
  establishmentId: string;
  avatarUrl?: string;
}

export async function createStaffMember(
  input: CreateStaffInput
): Promise<{ id: string } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return actionError('forbidden');

  const { data, error } = await supabase
    .from('staff_profiles')
    .insert({
      full_name: input.fullName,
      establishment_id: input.establishmentId,
      avatar_url: input.avatarUrl ?? null,
      is_active: false, // stays pending until they claim via join link
    })
    .select('id')
    .single();

  if (error) return actionError(classifyDbError(error), error, 'createStaffMember');

  revalidatePath(`/dashboard/establishments/${input.establishmentId}`);
  return { id: data.id };
}

interface InviteStaffInput {
  fullName: string;
  email: string;
  establishmentId: string;
  role: 'staff' | 'manager';
  locale?: string;
}

export async function inviteStaffMember(
  input: InviteStaffInput
): Promise<{ id: string; invited: boolean } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return actionError('forbidden');

  const normalizedEmail = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return actionError('validation');
  }
  if (!input.fullName.trim()) return actionError('validation');

  // Create the staff_profile through the user client so RLS verifies
  // the caller has permission on this establishment.
  // is_active stays false until the person claims their profile via the join link.
  const { data: staff, error: staffErr } = await supabase
    .from('staff_profiles')
    .insert({
      full_name: input.fullName.trim(),
      establishment_id: input.establishmentId,
      is_active: false,
    })
    .select('id')
    .single();

  if (staffErr || !staff) {
    return actionError(classifyDbError(staffErr), staffErr, 'inviteStaffMember');
  }

  // Send the invite via service role (admin API).
  const service = createServiceClient();
  const { data: est } = await service
    .from('establishments')
    .select('name')
    .eq('id', input.establishmentId)
    .maybeSingle();

  const { invited } = await sendStaffInviteLink(service, {
    staffProfileId: staff.id,
    fullName: input.fullName.trim(),
    email: normalizedEmail,
    establishmentId: input.establishmentId,
    establishmentName: est?.name ?? 'Digitip',
    role: input.role,
    locale: input.locale === 'fr' ? 'fr' : 'en',
  });

  revalidatePath('/dashboard/staff');
  return { id: staff.id, invited };
}

export async function updateStaffMember(
  staffId: string,
  input: { fullName?: string; avatarUrl?: string | null }
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return actionError('forbidden');

  const patch: Record<string, unknown> = {};
  if (input.fullName !== undefined) patch.full_name = input.fullName;
  if (input.avatarUrl !== undefined) patch.avatar_url = input.avatarUrl;
  if (Object.keys(patch).length === 0) return { success: true };

  const { data: updated, error } = await supabase
    .from('staff_profiles')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update(patch as any)
    .eq('id', staffId)
    .select('id');

  if (error) return actionError(classifyDbError(error), error, 'updateStaffMember');
  if (!updated || updated.length === 0) return actionError('forbidden');

  revalidatePath('/dashboard/staff');
  revalidatePath(`/dashboard/staff/${staffId}`);
  return { success: true };
}

export async function joinAsStaffMember(): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return actionError('forbidden');

  // Verify group_admin role and get group_id
  const { data: roleRow } = await supabase
    .from('user_roles')
    .select('group_id')
    .eq('user_id', user.id)
    .eq('role', 'group_admin')
    .not('group_id', 'is', null)
    .limit(1)
    .maybeSingle();

  if (!roleRow?.group_id) return actionError('forbidden');

  const service = createServiceClient();

  // Already has a staff profile?
  const { data: existing } = await service
    .from('staff_profiles')
    .select('id')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .maybeSingle();

  if (existing) return actionError('duplicate');

  const { data: est } = await service
    .from('establishments')
    .select('id')
    .eq('group_id', roleRow.group_id)
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle();

  if (!est) return actionError('notFound');

  const fullName =
    (user.user_metadata?.full_name as string | undefined)?.trim() ||
    user.email?.split('@')[0] ||
    'Admin';

  const { error } = await service.from('staff_profiles').insert({
    user_id: user.id,
    establishment_id: est.id,
    full_name: fullName,
    is_active: true,
    onboarding_status: 'not_started',
  });

  if (error) return actionError(classifyDbError(error), error, 'joinAsStaffMember');

  revalidatePath('/dashboard/staff');
  return { ok: true };
}

export async function deactivateStaffMember(
  staffId: string
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return actionError('forbidden');

  // Block soft-delete when there are pending tips: the FK is ON DELETE RESTRICT
  // and the UI would silently get an opaque error from the DB layer.
  const { count: pendingCount } = await supabase
    .from('transactions')
    .select('id', { count: 'exact', head: true })
    .eq('staff_id', staffId)
    .eq('status', 'pending');

  if ((pendingCount ?? 0) > 0) {
    const t = await getTranslations('errors');
    return { error: t('staffPendingTips') };
  }

  const { data: updated, error } = await supabase
    .from('staff_profiles')
    .update({ is_active: false, deleted_at: new Date().toISOString() })
    .eq('id', staffId)
    .select('id');

  if (error) return actionError(classifyDbError(error), error, 'deactivateStaffMember');
  if (!updated || updated.length === 0) return actionError('forbidden');

  revalidatePath('/dashboard');
  revalidatePath('/dashboard/staff');
  return { success: true };
}
