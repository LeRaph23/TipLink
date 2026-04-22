'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { nanoid } from '@/lib/nfc/nanoid';

export async function provisionNewSticker(
  establishmentId: string
): Promise<{ id: string; shortId: string; url: string } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  const shortId = nanoid();

  const { data, error } = await supabase
    .from('nfc_stickers')
    .insert({ short_id: shortId, establishment_id: establishmentId })
    .select('id, short_id')
    .single();

  if (error) return { error: error.message };

  revalidatePath('/dashboard/stickers');
  return {
    id: data.id,
    shortId: data.short_id,
    url: `${process.env.NEXT_PUBLIC_BASE_URL}/s/${data.short_id}`,
  };
}

export async function assignStickerToStaff(
  stickerId: string,
  staffId: string
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  // RLS enforces that the caller can only modify stickers within their scope
  const { error } = await supabase
    .from('nfc_stickers')
    .update({ staff_id: staffId, establishment_id: null })
    .eq('id', stickerId);

  if (error) return { error: error.message };

  revalidatePath('/dashboard/stickers');
  return { success: true };
}

export async function unassignSticker(
  stickerId: string,
  establishmentId: string
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  const { error } = await supabase
    .from('nfc_stickers')
    .update({ staff_id: null, establishment_id: establishmentId })
    .eq('id', stickerId);

  if (error) return { error: error.message };

  revalidatePath('/dashboard/stickers');
  return { success: true };
}
