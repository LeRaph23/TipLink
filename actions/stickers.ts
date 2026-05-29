'use server';

import { revalidatePath } from 'next/cache';
import { createServiceClient } from '@/lib/supabase/service';
import { getManageScope, canManageGroup } from '@/lib/auth/ownership';

// Lets a group admin re-assign one of THEIR SmartTags to one of THEIR
// establishments — the multi-salon case (e.g. a Duo pack split across two
// salons). Scoped to the caller's groups via getManageScope: the service
// client bypasses RLS, so both the tag's current establishment and the target
// establishment must be verified to belong to a group the caller manages.
// Tag assignment from stock (unassigned tags) stays a super-admin operation.
export async function assignTagToOwnEstablishment(
  stickerId: string,
  establishmentId: string,
): Promise<{ success: true } | { error: string }> {
  const scope = await getManageScope();
  if (!scope) return { error: 'Unauthorized' };

  const service = createServiceClient();

  // Target establishment must belong to a group the caller manages.
  const { data: target } = await service
    .from('establishments')
    .select('group_id')
    .eq('id', establishmentId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!target || !canManageGroup(scope, target.group_id)) {
    return { error: 'Établissement introuvable.' };
  }

  // The tag must currently belong to one of the caller's establishments, so
  // they can only move tags they already own — never grab a foreign or
  // in-stock tag.
  const { data: sticker } = await service
    .from('nfc_stickers')
    .select('id, establishment_id, establishments(group_id)')
    .eq('id', stickerId)
    .maybeSingle();
  const currentGroupId = (sticker?.establishments as { group_id: string } | null)?.group_id;
  if (!sticker?.establishment_id || !currentGroupId || !canManageGroup(scope, currentGroupId)) {
    return { error: 'SmartTag introuvable.' };
  }

  if (sticker.establishment_id === establishmentId) return { success: true };

  const { error } = await service
    .from('nfc_stickers')
    .update({ establishment_id: establishmentId })
    .eq('id', stickerId);
  if (error) return { error: error.message };

  revalidatePath('/dashboard/stickers');
  return { success: true };
}
