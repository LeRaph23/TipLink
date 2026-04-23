'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getBaseUrl } from '@/lib/env';

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
  if (!user) return { error: 'Unauthorized' };

  const { data, error } = await supabase
    .from('staff_profiles')
    .insert({
      full_name: input.fullName,
      establishment_id: input.establishmentId,
      avatar_url: input.avatarUrl ?? null,
    })
    .select('id')
    .single();

  if (error) return { error: error.message };

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
  if (!user) return { error: 'Unauthorized' };

  const normalizedEmail = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return { error: 'Invalid email' };
  }
  if (!input.fullName.trim()) return { error: 'Full name required' };

  // Create the staff_profile through the user client so RLS verifies
  // the caller has permission on this establishment.
  const { data: staff, error: staffErr } = await supabase
    .from('staff_profiles')
    .insert({
      full_name: input.fullName.trim(),
      establishment_id: input.establishmentId,
    })
    .select('id')
    .single();

  if (staffErr || !staff) {
    return { error: staffErr?.message ?? 'Failed to create staff profile' };
  }

  // Send the invite via service role (admin API).
  const service = createServiceClient();
  const locale = input.locale === 'fr' ? 'fr' : 'en';
  const base = getBaseUrl();

  let invited = false;
  try {
    const anyService = service as unknown as {
      auth: {
        admin: {
          inviteUserByEmail: (
            email: string,
            options?: { redirectTo?: string; data?: Record<string, unknown> }
          ) => Promise<{ data: { user: { id: string } | null } | null; error: { message: string } | null }>;
        };
      };
    };
    const { data: inviteData, error: inviteErr } = await anyService.auth.admin.inviteUserByEmail(
      normalizedEmail,
      {
        redirectTo: `${base}/auth/callback?next=/dashboard&locale=${locale}`,
        data: {
          full_name: input.fullName.trim(),
          staff_profile_id: staff.id,
          establishment_id: input.establishmentId,
          pending_role: input.role,
        },
      }
    );

    if (!inviteErr && inviteData?.user?.id) {
      invited = true;
      // Link the auth user to this staff_profile immediately so onboarding
      // works the moment they accept the invite.
      await service
        .from('staff_profiles')
        .update({ user_id: inviteData.user.id })
        .eq('id', staff.id);

      // Pre-create role for the invited user.
      await service.from('user_roles').insert({
        user_id: inviteData.user.id,
        role: input.role,
        establishment_id: input.role === 'manager' ? input.establishmentId : null,
      });
    }
  } catch {
    // Swallow: staff_profile is still created, admin can resend invite later.
  }

  revalidatePath('/dashboard/staff');
  return { id: staff.id, invited };
}

export async function updateStaffMember(
  staffId: string,
  input: { fullName?: string; avatarUrl?: string | null }
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  const patch: Record<string, unknown> = {};
  if (input.fullName !== undefined) patch.full_name = input.fullName;
  if (input.avatarUrl !== undefined) patch.avatar_url = input.avatarUrl;
  if (Object.keys(patch).length === 0) return { success: true };

  const { error } = await supabase
    .from('staff_profiles')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update(patch as any)
    .eq('id', staffId);

  if (error) return { error: error.message };

  revalidatePath('/dashboard/staff');
  revalidatePath(`/dashboard/staff/${staffId}`);
  return { success: true };
}

export async function deactivateStaffMember(
  staffId: string
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  const { error } = await supabase
    .from('staff_profiles')
    .update({ is_active: false, deleted_at: new Date().toISOString() })
    .eq('id', staffId);

  if (error) return { error: error.message };

  revalidatePath('/dashboard');
  revalidatePath('/dashboard/staff');
  return { success: true };
}
