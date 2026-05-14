'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getBaseUrl } from '@/lib/env';
import { sendStaffInviteEmail } from '@/lib/email';

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
      is_active: false, // stays pending until they claim via join link
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
    return { error: staffErr?.message ?? 'Failed to create staff profile' };
  }

  // Send the invite via service role (admin API).
  const service = createServiceClient();
  const locale = input.locale === 'fr' ? 'fr' : 'en';
  const base = getBaseUrl();

  // Fetch establishment name so we can personalise the invite email.
  const { data: est } = await service
    .from('establishments')
    .select('name')
    .eq('id', input.establishmentId)
    .maybeSingle();
  const establishmentName = est?.name ?? 'Digitip';

  // We generate the invite link ourselves and send a custom email via Resend.
  // The previous flow used Supabase's `inviteUserByEmail`, which sends an email
  // whose link goes through Supabase's hosted `/auth/v1/verify` endpoint. That
  // endpoint returns auth material in a URL fragment, which our server-side
  // `/auth/callback` route cannot read — so the invitee landed on /login
  // instead of the staff onboarding (`/join/[establishmentId]`).
  //
  // By using `generateLink` and emailing the `token_hash` directly to our own
  // callback, the callback can `verifyOtp` server-side and redirect to the
  // staff onboarding with the email pre-filled.
  const nextPath = `/join/${input.establishmentId}`;
  const adminClient = service as unknown as {
    auth: {
      admin: {
        generateLink: (params: {
          type: 'invite';
          email: string;
          options?: { redirectTo?: string; data?: Record<string, unknown> };
        }) => Promise<{
          data: {
            user: { id: string } | null;
            properties: { hashed_token: string; action_link: string } | null;
          } | null;
          error: { message: string } | null;
        }>;
      };
    };
  };

  let invited = false;
  try {
    const { data: linkData, error: linkErr } = await adminClient.auth.admin.generateLink({
      type: 'invite',
      email: normalizedEmail,
      options: {
        redirectTo: `${base}/auth/callback?next=${encodeURIComponent(nextPath)}&locale=${locale}`,
        data: {
          full_name: input.fullName.trim(),
          staff_profile_id: staff.id,
          establishment_id: input.establishmentId,
          pending_role: input.role,
        },
      },
    });

    const userId = linkData?.user?.id ?? null;
    const hashedToken = linkData?.properties?.hashed_token ?? null;

    if (!linkErr && userId) {
      // Link the auth user to this staff_profile immediately so onboarding
      // works the moment they accept the invite.
      await service
        .from('staff_profiles')
        .update({ user_id: userId })
        .eq('id', staff.id);

      // Pre-create role for the invited user.
      await service.from('user_roles').insert({
        user_id: userId,
        role: input.role,
        establishment_id: input.role === 'manager' ? input.establishmentId : null,
      });

      if (hashedToken) {
        const params = new URLSearchParams({
          token_hash: hashedToken,
          type: 'invite',
          next: nextPath,
          locale,
        });
        const inviteUrl = `${base}/auth/callback?${params.toString()}`;

        const { ok } = await sendStaffInviteEmail({
          to: normalizedEmail,
          fullName: input.fullName.trim(),
          establishmentName,
          inviteUrl,
          locale,
        });
        invited = ok;
      }
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

  const { data: updated, error } = await supabase
    .from('staff_profiles')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update(patch as any)
    .eq('id', staffId)
    .select('id');

  if (error) return { error: error.message };
  if (!updated || updated.length === 0) return { error: 'Forbidden' };

  revalidatePath('/dashboard/staff');
  revalidatePath(`/dashboard/staff/${staffId}`);
  return { success: true };
}

export async function joinAsStaffMember(): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  // Verify group_admin role and get group_id
  const { data: roleRow } = await supabase
    .from('user_roles')
    .select('group_id')
    .eq('user_id', user.id)
    .eq('role', 'group_admin')
    .not('group_id', 'is', null)
    .limit(1)
    .maybeSingle();

  if (!roleRow?.group_id) return { error: 'Not a group admin' };

  const service = createServiceClient();

  // Already has a staff profile?
  const { data: existing } = await service
    .from('staff_profiles')
    .select('id')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .maybeSingle();

  if (existing) return { error: 'Already a staff member' };

  const { data: est } = await service
    .from('establishments')
    .select('id')
    .eq('group_id', roleRow.group_id)
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle();

  if (!est) return { error: 'No establishment found' };

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

  if (error) return { error: error.message };

  revalidatePath('/dashboard/staff');
  return { ok: true };
}

export async function deactivateStaffMember(
  staffId: string
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  const { data: updated, error } = await supabase
    .from('staff_profiles')
    .update({ is_active: false, deleted_at: new Date().toISOString() })
    .eq('id', staffId)
    .select('id');

  if (error) return { error: error.message };
  if (!updated || updated.length === 0) return { error: 'Forbidden' };

  revalidatePath('/dashboard');
  revalidatePath('/dashboard/staff');
  return { success: true };
}
