'use server';

import { revalidatePath } from 'next/cache';
import { createServiceClient } from '@/lib/supabase/service';
import { getManageScope, canManageGroup } from '@/lib/auth/ownership';
import { startFreeTrial } from '@/lib/billing/free-trial';

/**
 * "Essayer 30 jours, sans carte" on the offer. Owner-only: the write goes
 * through the service client. Refused, not an error, for a group that already
 * had its trial; the card then offers the subscription instead.
 */
export async function startProTrial(groupId: string): Promise<{ ok: boolean }> {
  const scope = await getManageScope();
  if (!scope || !canManageGroup(scope, groupId)) return { ok: false };
  const started = await startFreeTrial(createServiceClient(), groupId);
  revalidatePath('/dashboard', 'layout');
  return { ok: started };
}
