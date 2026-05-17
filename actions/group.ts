'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getManageScope, canManageGroup } from '@/lib/auth/ownership';

interface UpdateGroupInput {
  groupId: string;
  name?: string;
  logoUrl?: string | null;
  tipThresholds?: number[];
  legalName?: string | null;
  vatNumber?: string | null;
}

export async function updateGroup(
  input: UpdateGroupInput
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  // Defense-in-depth: authorize at the application layer, not on RLS alone.
  const scope = await getManageScope();
  if (!scope || !canManageGroup(scope, input.groupId)) return { error: 'Forbidden' };

  const { data: current } = await supabase
    .from('groups')
    .select('settings')
    .eq('id', input.groupId)
    .single();

  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.logoUrl !== undefined) patch.logo_url = input.logoUrl;
  if (input.legalName !== undefined) patch.legal_name = input.legalName;
  if (input.vatNumber !== undefined) patch.vat_number = input.vatNumber;

  if (input.tipThresholds !== undefined) {
    const currentSettings = (current?.settings as Record<string, unknown> | null) ?? {};
    const cleaned = input.tipThresholds
      .filter((v) => typeof v === 'number' && v >= 2 && v < 10000)
      .slice(0, 4);
    if (cleaned.length !== 4) return { error: 'Les quatre montants doivent être au minimum 2 €.' };
    patch.settings = { ...currentSettings, tip_thresholds: cleaned };
  }

  if (Object.keys(patch).length === 0) return { success: true };

  const { data: updated, error } = await supabase
    .from('groups')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update(patch as any)
    .eq('id', input.groupId)
    .select('id');

  if (error) return { error: error.message };
  if (!updated || updated.length === 0) return { error: 'Forbidden' };

  revalidatePath('/dashboard/settings');
  return { success: true };
}

export async function updateGroupPlatformFee(
  groupId: string,
  bps: number
): Promise<{ success: true } | { error: string }> {
  if (!Number.isInteger(bps) || bps < 0 || bps > 1500) {
    return { error: 'Fee must be an integer between 0 and 1500 basis points' };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  const { data: role } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .eq('role', 'super_admin')
    .maybeSingle();

  if (!role) return { error: 'Forbidden' };

  const service = createServiceClient();
  const { error } = await service
    .from('groups')
    .update({ platform_fee_bps: bps })
    .eq('id', groupId);

  if (error) return { error: error.message };

  revalidatePath('/dashboard/admin/groups');
  return { success: true };
}

export async function createSalon(input: {
  name: string;
  country: string;
  currency: string;
}): Promise<{ groupId: string; establishmentId: string } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  const { data: role } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .eq('role', 'super_admin')
    .maybeSingle();

  if (!role) return { error: 'Forbidden' };

  const name = input.name.trim();
  if (!name) return { error: 'Name is required' };

  const service = createServiceClient();

  const { data: group, error: ge } = await service
    .from('groups')
    .insert({ name, settings: { tip_thresholds: [1, 2, 5, 10] } })
    .select('id')
    .single();

  if (ge || !group) return { error: ge?.message ?? 'Failed to create group' };

  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

  const { data: est, error: ee } = await service
    .from('establishments')
    .insert({
      group_id: group.id,
      name,
      business_type: 'beauty',
      slug,
      country: input.country.toUpperCase(),
      currency: input.currency.toLowerCase(),
      onboarding_status: 'not_started',
    })
    .select('id')
    .single();

  if (ee || !est) return { error: ee?.message ?? 'Failed to create establishment' };

  revalidatePath('/dashboard/admin/groups');
  return { groupId: group.id, establishmentId: est.id };
}
