'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

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
  return { success: true };
}
