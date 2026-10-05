'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getManageScope, canManageGroup } from '@/lib/auth/ownership';

/**
 * Takes a compliment's message down, or puts it back.
 *
 * The text was written by a stranger and lands on an employee's dashboard, so
 * the manager needs a way to remove one. It is hidden, not deleted: the count
 * stays honest and a mistake can be undone.
 *
 * Who may: the group's admin, or a manager of that establishment. Checked
 * here because the write goes through the service client, which no RLS policy
 * can catch.
 */
export async function setComplimentHidden(
  complimentId: string,
  hidden: boolean,
): Promise<{ success: true } | { error: string }> {
  const scope = await getManageScope();
  if (!scope) return { error: 'Forbidden' };

  const service = createServiceClient();
  const { data: row } = await service
    .from('tip_compliments')
    .select('id, establishment_id, establishments(group_id)')
    .eq('id', complimentId)
    .maybeSingle();
  if (!row) return { error: 'Not found' };

  const groupId = (row.establishments as { group_id?: string } | null)?.group_id ?? null;
  let allowed = groupId ? canManageGroup(scope, groupId) : false;
  if (!allowed) {
    const supabase = await createClient();
    const { data: managed } = await supabase
      .from('user_roles')
      .select('id')
      .eq('user_id', scope.userId)
      .eq('role', 'manager')
      .eq('establishment_id', row.establishment_id)
      .maybeSingle();
    allowed = Boolean(managed);
  }
  if (!allowed) return { error: 'Forbidden' };

  const { error } = await service
    .from('tip_compliments')
    .update({ hidden_at: hidden ? new Date().toISOString() : null } as never)
    .eq('id', complimentId);
  if (error) return { error: error.message };

  revalidatePath('/dashboard/compliments');
  return { success: true };
}
