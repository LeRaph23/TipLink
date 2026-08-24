import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { stripe } from '@/lib/stripe/client';
import { isAuthorizedCronRequest } from '@/lib/auth/require-cron';

export const runtime = 'nodejs';

const MAX_ATTEMPTS = 5;
const RETRY_DELAY_MS = 5 * 60 * 1000; // wait 5 min before first retry

// Replays the transfer of a settled tip to its establishment when the webhook
// could not complete it — it crashed after the charge, or Stripe returned a
// transient error. There is one transfer per tip now, so the retry state lives
// on the transaction itself rather than on per-employee ledger rows.
//
// The idempotency key `tip:<transactionId>` is the same one the webhook uses,
// so a race between the two can never move the money twice.
export async function POST(req: Request) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const service = createServiceClient();
  const cutoff = new Date(Date.now() - RETRY_DELAY_MS).toISOString();

  const { data: rows } = await service
    .from('transactions')
    .select(`
      id, amount, currency, stripe_charge_id, metadata, transfer_attempts,
      establishments(stripe_account_id)
    `)
    .in('transfer_status', ['pending', 'failed'])
    .is('stripe_transfer_id', null)
    .eq('status', 'succeeded')
    .lt('created_at', cutoff)
    .lt('transfer_attempts', MAX_ATTEMPTS)
    .limit(100);

  let processed = 0;
  let succeeded = 0;
  let failed = 0;
  let blocked = 0;

  for (const row of rows ?? []) {
    processed++;
    const r = row as unknown as {
      id: string;
      currency: string;
      stripe_charge_id: string | null;
      transfer_attempts: number;
      metadata: { transfer_group?: string; tip_amount?: number } | null;
      establishments: { stripe_account_id: string | null } | null;
    };

    const account = r.establishments?.stripe_account_id ?? null;
    const chargeId = r.stripe_charge_id;
    const currency = r.currency?.toLowerCase();
    // The recipient's share is the tip itself — the service fee was paid on top
    // by the tipper and stays with the platform.
    const amount = Number(r.metadata?.tip_amount);

    // The establishment's account was detached, or the transaction predates the
    // fee model. Neither is retryable without a human — count it, don't burn an
    // attempt, and let the exhausted query below surface it.
    if (!account || !chargeId || !currency || !Number.isFinite(amount) || amount <= 0) {
      console.error('[reconcile] tip transfer blocked', {
        transactionId: r.id,
        hasAccount: !!account,
        hasCharge: !!chargeId,
        amount,
      });
      blocked++;
      continue;
    }

    try {
      const transfer = await stripe.transfers.create(
        {
          amount,
          currency,
          destination: account,
          description: 'Pourboire',
          ...(r.metadata?.transfer_group ? { transfer_group: r.metadata.transfer_group } : {}),
          source_transaction: chargeId,
        },
        { idempotencyKey: `tip:${r.id}` }
      );
      await service
        .from('transactions')
        .update({
          stripe_transfer_id: transfer.id,
          transfer_status: 'succeeded',
          transfer_attempts: r.transfer_attempts + 1,
          transfer_error: null,
        } as never)
        .eq('id', r.id);
      succeeded++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown';
      console.error('[reconcile] transfer retry failed', {
        transactionId: r.id,
        attempts: r.transfer_attempts + 1,
        err: msg,
      });
      await service
        .from('transactions')
        .update({
          transfer_status: 'failed',
          transfer_error: msg,
          transfer_attempts: r.transfer_attempts + 1,
        } as never)
        .eq('id', r.id);
      failed++;
    }
  }

  // Transfers that have burned every retry are real stuck funds: the money sat
  // on the platform, the employee is credited in tip_allocations, and the loop
  // above will never pick them up again (it filters on attempts). Log and
  // return them so monitoring can alert instead of losing them silently.
  const { count: exhausted } = await service
    .from('transactions')
    .select('id', { count: 'exact', head: true })
    .in('transfer_status', ['pending', 'failed'])
    .gte('transfer_attempts', MAX_ATTEMPTS);

  if ((exhausted ?? 0) > 0) {
    console.error('[reconcile] stuck tip transfers need manual triage', { exhausted });
  }

  return NextResponse.json({ ok: true, processed, succeeded, failed, blocked, exhausted: exhausted ?? 0 });
}

// Vercel cron uses GET with the same auth header.
export const GET = POST;
