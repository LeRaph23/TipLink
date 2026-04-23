'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

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
      .filter((v) => typeof v === 'number' && v > 0 && v < 10000)
      .slice(0, 4);
    if (cleaned.length !== 4) {
      return { error: 'Four positive tip amounts required' };
    }
    patch.settings = { ...currentSettings, tip_thresholds: cleaned };
  }

  if (Object.keys(patch).length === 0) return { success: true };

  const { error } = await supabase
    .from('groups')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update(patch as any)
    .eq('id', input.groupId);

  if (error) return { error: error.message };

  revalidatePath('/dashboard/settings');
  return { success: true };
}
