import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { stripe } from '@/lib/stripe/client';
import { isAuthorizedCronRequest } from '@/lib/auth/require-cron';

export const runtime = 'nodejs';

const MAX_ATTEMPTS = 5;
const RETRY_DELAY_MS = 5 * 60 * 1000; // wait 5 min before first retry

// Picks up tip_transfers rows left in `pending` (webhook crashed during
// the per-staff Stripe loop) or `failed` (transient Stripe error) and replays
// the transfer. Idempotency key `gtt:<row.id>` makes Stripe deduplicate.
export async function POST(req: Request) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const service = createServiceClient();
  const cutoff = new Date(Date.now() - RETRY_DELAY_MS).toISOString();

  const { data: rows } = await service
    .from('tip_transfers')
    .select(`
      id, transaction_id, staff_id, amount, attempts, status,
      staff_profiles(stripe_account_id),
      transactions(stripe_charge_id, currency, metadata)
    `)
    .in('status', ['pending', 'failed'])
    .lt('created_at', cutoff)
    .lt('attempts', MAX_ATTEMPTS)
    .limit(100);

  let processed = 0;
  let succeeded = 0;
  let failed = 0;

  for (const row of rows ?? []) {
    processed++;
    const r = row as unknown as {
      id: string;
      amount: number;
      attempts: number;
      staff_profiles: { stripe_account_id: string | null } | null;
      transactions: { stripe_charge_id: string | null; currency: string; metadata: { transfer_group?: string } | null } | null;
    };
    const staffAccount = r.staff_profiles?.stripe_account_id;
    const chargeId = r.transactions?.stripe_charge_id;
    const transferGroup = r.transactions?.metadata?.transfer_group;
    const currency = r.transactions?.currency?.toLowerCase();

    if (!staffAccount || !chargeId || !transferGroup || !currency) {
      // Cannot retry without these — leave the row alone for manual triage.
      await service
        .from('tip_transfers')
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
          transfer_group: transferGroup,
          source_transaction: chargeId,
        },
        { idempotencyKey: `gtt:${r.id}` }
      );
      await service
        .from('tip_transfers')
        .update({
          status: 'succeeded',
          stripe_transfer_id: transfer.id,
          attempts: r.attempts + 1,
          error: null,
        } as never)
        .eq('id', r.id);
      succeeded++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown';
      await service
        .from('tip_transfers')
        .update({
          status: 'failed',
          error: msg,
          attempts: r.attempts + 1,
        } as never)
        .eq('id', r.id);
      failed++;
    }
  }

  return NextResponse.json({ ok: true, processed, succeeded, failed });
}

// Vercel cron uses GET with the same auth header.
export const GET = POST;
