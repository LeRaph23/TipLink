import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { stripe } from '@/lib/stripe/client';
import { isAuthorizedCronRequest } from '@/lib/auth/require-cron';

export const runtime = 'nodejs';

// This used to refund tips held for a staff member who never finished their
// own Stripe onboarding. That can no longer happen — the establishment is
// verified before its tip pages open — but a tip can still get stuck: an
// account restricted between the charge and the transfer, or a transfer that
// burned every retry in the reconcile cron.
//
// Sitting on a customer's money indefinitely is not an option, so anything
// still undelivered after this many days goes back to them. 90 keeps us safely
// inside Stripe's ~180-day card-refund window (a refund to an expired card
// fails beyond that). Configurable via env to tune without a deploy.
const EXPIRY_DAYS = Number(process.env.UNCLAIMED_TIP_EXPIRY_DAYS ?? 90);

export async function POST(req: Request) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const service = createServiceClient();
  const cutoff = new Date(Date.now() - EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: rowsRaw } = await service
    .from('transactions')
    .select('id, stripe_charge_id, refunded_amount, metadata')
    .eq('status', 'succeeded')
    .is('stripe_transfer_id', null)
    .in('transfer_status', ['pending', 'failed'])
    .lt('succeeded_at', cutoff)
    .not('stripe_charge_id', 'is', null)
    .limit(200);

  const rows = (rowsRaw ?? []) as unknown as Array<{
    id: string;
    stripe_charge_id: string | null;
    refunded_amount: number | null;
    metadata: { tip_amount?: number } | null;
  }>;

  let refunded = 0;
  let failed = 0;

  for (const r of rows) {
    const chargeId = r.stripe_charge_id;
    // Refund only the tip. The service fee covered Stripe's own cost on a
    // charge that did go through, and refunding it would leave the platform out
    // of pocket on a failure it did not cause.
    const amount = Number(r.metadata?.tip_amount);
    if (!chargeId || !Number.isFinite(amount) || amount <= 0) {
      failed++;
      continue;
    }
    try {
      await stripe.refunds.create(
        {
          charge: chargeId,
          amount,
          metadata: { reason: 'undelivered_tip_expired', transaction: r.id },
        },
        { idempotencyKey: `expire:${r.id}` }
      );
      await service
        .from('transactions')
        .update({
          transfer_status: 'reversed',
          transfer_error: 'undelivered_tip_expired',
          refunded_amount: (r.refunded_amount ?? 0) + amount,
        } as never)
        .eq('id', r.id);
      // The employee was credited for a tip that is going back to the customer,
      // so the payroll export must stop counting it.
      await service
        .from('tip_allocations')
        .update({ status: 'reversed', reversed_at: new Date().toISOString() } as never)
        .eq('transaction_id', r.id);
      refunded++;
    } catch (err) {
      console.error('undelivered tip expiry refund failed', { transactionId: r.id, err });
      failed++;
    }
  }

  return NextResponse.json({ ok: true, scanned: rows.length, refunded, failed, expiryDays: EXPIRY_DAYS });
}

// Vercel cron uses GET with the same auth header.
export const GET = POST;
