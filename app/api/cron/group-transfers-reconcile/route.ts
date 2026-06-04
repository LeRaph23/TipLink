import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { stripe } from '@/lib/stripe/client';
import { isAuthorizedCronRequest } from '@/lib/auth/require-cron';

export const runtime = 'nodejs';

const MAX_ATTEMPTS = 5;
const RETRY_DELAY_MS = 5 * 60 * 1000; // wait 5 min before first retry

// Picks up group_tip_transfers rows left in `pending` (webhook crashed during
// the per-staff Stripe loop) or `failed` (transient Stripe error) and replays
// the transfer. Idempotency key `gtt:<row.id>` makes Stripe deduplicate.
export async function POST(req: Request) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const service = createServiceClient();
  const cutoff = new Date(Date.now() - RETRY_DELAY_MS).toISOString();

  const { data: rows } = await service
    .from('group_tip_transfers')
    .select(`
      id, transaction_id, staff_id, amount, attempts, status,
      staff_profiles(stripe_account_id, onboarding_status),
      transactions(stripe_charge_id, currency, metadata)
    `)
    .in('status', ['pending', 'failed'])
    .lt('created_at', cutoff)
    .lt('attempts', MAX_ATTEMPTS)
    .limit(100);

  let processed = 0;
  let succeeded = 0;
  let failed = 0;
  let held = 0;

  for (const row of rows ?? []) {
    processed++;
    const r = row as unknown as {
      id: string;
      amount: number;
      attempts: number;
      staff_profiles: { stripe_account_id: string | null; onboarding_status: string } | null;
      transactions: { stripe_charge_id: string | null; currency: string; metadata: { transfer_group?: string } | null } | null;
    };
    const staffReady =
      !!r.staff_profiles?.stripe_account_id && r.staff_profiles.onboarding_status === 'complete';
    const staffAccount = staffReady ? r.staff_profiles!.stripe_account_id! : null;
    const chargeId = r.transactions?.stripe_charge_id;
    const transferGroup = r.transactions?.metadata?.transfer_group;
    const currency = r.transactions?.currency?.toLowerCase();

    // Staff member hasn't finished onboarding yet → the allocation is
    // legitimately held, not failed. Skip it without touching attempts.
    if (!staffAccount) {
      held++;
      continue;
    }

    if (!chargeId || !currency) {
      // Cannot retry without these — leave the row for manual triage.
      await service
        .from('group_tip_transfers')
        .update({ attempts: r.attempts + 1, error: 'missing context' } as never)
        .eq('id', r.id);
      failed++;
      continue;
    }

    try {
      const transfer = await stripe.transfers.create(
        {
          amount: r.amount,
          currency,
          destination: staffAccount,
          description: 'Pourboire',
          ...(transferGroup ? { transfer_group: transferGroup } : {}),
          source_transaction: chargeId,
        },
        { idempotencyKey: `gtt:${r.id}` }
      );
      await service
        .from('group_tip_transfers')
        .update({
          status: 'succeeded',
          stripe_transfer_id: transfer.id,
          attempts: r.attempts + 1,
          error: null,
          transferred_at: new Date().toISOString(),
        } as never)
        .eq('id', r.id);
      succeeded++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown';
      await service
        .from('group_tip_transfers')
        .update({
          status: 'failed',
          error: msg,
          attempts: r.attempts + 1,
        } as never)
        .eq('id', r.id);
      failed++;
    }
  }

  return NextResponse.json({ ok: true, processed, succeeded, failed, held });
}

// Vercel cron uses GET with the same auth header.
export const GET = POST;
