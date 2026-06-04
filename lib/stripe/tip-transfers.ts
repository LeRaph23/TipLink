import 'server-only';
import { stripe } from './client';
import type { createServiceClient } from '@/lib/supabase/service';

type Supabase = ReturnType<typeof createServiceClient>;

// Release every held (pending) tip allocation for a staff member by creating
// the Stripe transfers to their connected account. Funds were captured on the
// platform (separate charge) and held until the staff member finished
// onboarding; this is what pays them out.
//
// Called when a staff member completes onboarding (the account.updated webhook)
// and as a safety net by the reconcile cron. Idempotent: the `gtt:<rowId>`
// transfer idempotency key makes Stripe deduplicate replays, and rows already
// `succeeded` are skipped.
export async function releaseStaffPendingTransfers(
  supabase: Supabase,
  staffId: string,
): Promise<{ released: number; failed: number }> {
  const { data: staff } = await supabase
    .from('staff_profiles')
    .select('stripe_account_id, onboarding_status')
    .eq('id', staffId)
    .maybeSingle();

  // Only pay out once the account is actually ready to receive transfers.
  if (!staff?.stripe_account_id || staff.onboarding_status !== 'complete') {
    return { released: 0, failed: 0 };
  }
  const account = staff.stripe_account_id;

  const { data: rowsRaw } = await supabase
    .from('group_tip_transfers')
    .select('id, amount, status, transactions(stripe_charge_id, currency, metadata)')
    .eq('staff_id', staffId);

  const rows = ((rowsRaw ?? []) as Array<{
    id: string;
    amount: number;
    status?: string;
    transactions: { stripe_charge_id: string | null; currency: string; metadata: { transfer_group?: string } | null } | null;
  }>).filter((r) => (r.status ?? 'pending') === 'pending');

  let released = 0;
  let failed = 0;

  for (const row of rows) {
    const chargeId = row.transactions?.stripe_charge_id;
    const currency = row.transactions?.currency?.toLowerCase();
    const transferGroup = row.transactions?.metadata?.transfer_group;
    if (!chargeId || !currency) {
      failed++;
      continue;
    }
    try {
      const transfer = await stripe.transfers.create(
        {
          amount: row.amount,
          currency,
          destination: account,
          description: 'Pourboire',
          ...(transferGroup ? { transfer_group: transferGroup } : {}),
          source_transaction: chargeId,
        },
        { idempotencyKey: `gtt:${row.id}` }
      );
      await supabase
        .from('group_tip_transfers')
        .update({ status: 'succeeded', stripe_transfer_id: transfer.id, error: null, transferred_at: new Date().toISOString() } as never)
        .eq('id', row.id);
      released++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown';
      console.error('releaseStaffPendingTransfers failed', { rowId: row.id, err });
      await supabase
        .from('group_tip_transfers')
        .update({ status: 'failed', error: msg } as never)
        .eq('id', row.id);
      failed++;
    }
  }

  return { released, failed };
}
