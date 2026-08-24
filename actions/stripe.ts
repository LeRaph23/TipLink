'use server';

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';

// Lifetime net tips received by the signed-in staff member (succeeded tips,
// minus the platform commission and any refunds). Shown on the banking page.
export async function getStaffEarnings(): Promise<
  { ok: true; lifetimeNet: number } | { error: string }
> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  const service = createServiceClient();
  const { data: profile } = await service
    .from('staff_profiles')
    .select('id')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .maybeSingle();
  if (!profile) return { error: 'Aucun profil staff trouvé.' };

  const { data: txns } = await service
    .from('transactions')
    .select('amount, application_fee_amount, refunded_amount')
    .eq('staff_id', profile.id)
    .eq('status', 'succeeded');

  const lifetimeNet = (txns ?? []).reduce((sum, t) => {
    const row = t as { amount: number; application_fee_amount: number | null; refunded_amount: number | null };
    const fee = row.application_fee_amount ?? 0;
    const refunded = row.refunded_amount ?? 0;
    return sum + Math.max(0, row.amount - fee - refunded);
  }, 0);

  return { ok: true, lifetimeNet };
}

// Bootstraps a staff profile for a group admin who opted into receiving tips
// but has none from the normal join flow. Returns null when the user is not a
// group admin with an establishment. Not a server action (no `export`).
