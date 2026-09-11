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
const DEFAULT_EXPIRY_DAYS = 90;

/**
 * Days before an undelivered tip is returned to the customer.
 *
 * Parsed defensively because this is the one variable in the file that can
 * refund real money. Read as a bare `Number(process.env.X ?? 90)` it had two
 * ways to go wrong, neither of them loud: a non-numeric value produced NaN, and
 * `new Date(NaN).toISOString()` throws, killing the whole cron; and `0` is not
 * nullish, so `?? 90` let it through and every undelivered tip would have been
 * refunded on the spot. Anything not a sane positive integer falls back to the
 * default and says so.
 */
function resolveExpiryDays(): number {
  const raw = process.env.UNCLAIMED_TIP_EXPIRY_DAYS;
  if (raw === undefined || raw.trim() === '') return DEFAULT_EXPIRY_DAYS;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 180) {
    console.error(
      `[unclaimed-tips-expire] UNCLAIMED_TIP_EXPIRY_DAYS="${raw}" is not an integer between 1 and 180 — ` +
      `falling back to ${DEFAULT_EXPIRY_DAYS}. (180 is Stripe's card-refund window.)`
    );
    return DEFAULT_EXPIRY_DAYS;
  }
  return parsed;
}

const EXPIRY_DAYS = resolveExpiryDays();

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
    .or('transfer_status.is.null,transfer_status.in.(pending,failed)')
    .lt('succeeded_at', cutoff)
    .not('stripe_charge_id', 'is', null)
    .order('succeeded_at', { ascending: true })
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
      // Not refundable without a human. Record why, rather than counting it and
      // moving on: an untouched row stays in this query for ever and holds one
      // of the 200 slots, so enough of them would crowd out the tips that can
      // actually be returned. 'failed' keeps it in the reconcile cron's view,
      // where attempts burn and it surfaces in the exhausted count.
      console.error('[unclaimed-tips-expire] not refundable', {
        transactionId: r.id,
        hasCharge: !!chargeId,
        amount,
      });
      await service
        .from('transactions')
        .update({
          transfer_status: 'failed',
          transfer_error: 'expiry_blocked:no_tip_amount',
        } as never)
        .eq('id', r.id);
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
