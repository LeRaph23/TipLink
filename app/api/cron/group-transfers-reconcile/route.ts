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
    .or('transfer_status.is.null,transfer_status.in.(pending,failed)')
    .is('stripe_transfer_id', null)
    .eq('status', 'succeeded')
    .lt('created_at', cutoff)
    .lt('transfer_attempts', MAX_ATTEMPTS)
    // Oldest first, and deterministic. Without an ORDER BY, Postgres was free
    // to return a different arbitrary 100 each night, so a given stuck tip
    // might or might not be looked at.
    .order('created_at', { ascending: true })
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
    // fee model. Neither is retryable without a human.
    //
    // This used to `continue` without touching the row, on the stated
    // assumption that the exhausted query below would surface it. It could
    // not: that query counts transfer_attempts >= MAX_ATTEMPTS, and skipping
    // the increment meant a blocked row never reached it. So the row stayed in
    // the selection for ever, holding one of the 100 slots, every night. Past
    // a hundred such rows the cron did nothing but re-read the same dead ones
    // and no genuinely retryable transfer was ever attempted again.
    //
    // Burning the attempt is what lets it age out of the retry window and into
    // the exhausted count, which is the signal a human is meant to act on.
    if (!account || !chargeId || !currency || !Number.isFinite(amount) || amount <= 0) {
      const reason = !account
        ? 'no_connect_account'
        : !chargeId
          ? 'no_charge'
          : 'no_tip_amount';
      console.error('[reconcile] tip transfer blocked', {
        transactionId: r.id,
        reason,
        attempts: r.transfer_attempts + 1,
        amount,
      });
      await service
        .from('transactions')
        .update({
          transfer_status: 'failed',
          transfer_error: `blocked:${reason}`,
          transfer_attempts: r.transfer_attempts + 1,
        } as never)
        .eq('id', r.id);
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
    .or('transfer_status.is.null,transfer_status.in.(pending,failed)')
    // Mirror the retry selection exactly. Without these two the count drifted
    // looser than the loop above, so the number reported for triage did not
    // describe the same set of rows the cron had given up on.
    .is('stripe_transfer_id', null)
    .eq('status', 'succeeded')
    .gte('transfer_attempts', MAX_ATTEMPTS);

  if ((exhausted ?? 0) > 0) {
    console.error('[reconcile] stuck tip transfers need manual triage', { exhausted });
  }

  return NextResponse.json({ ok: true, processed, succeeded, failed, blocked, exhausted: exhausted ?? 0 });
}

// Vercel cron uses GET with the same auth header.
export const GET = POST;
