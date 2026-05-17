import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

type ServiceClient = SupabaseClient<Database>;

/**
 * Sum (in cents) of bonuses a super-admin has credited to this ambassador —
 * weekly tier bonuses and monthly-challenge wins. Only credited bonuses count
 * toward the withdrawable balance; nothing is automatic.
 */
export async function sumCreditedBonusCents(
  service: ServiceClient,
  ambassadorId: string
): Promise<number> {
  const { data } = await service
    .from('ambassador_bonus_credits')
    .select('amount_cents')
    .eq('ambassador_id', ambassadorId);
  return (data ?? []).reduce((sum, r) => sum + (r.amount_cents ?? 0), 0);
}
