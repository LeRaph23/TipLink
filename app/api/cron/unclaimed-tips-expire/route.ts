import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { stripe } from '@/lib/stripe/client';
import { isAuthorizedCronRequest } from '@/lib/auth/require-cron';

export const runtime = 'nodejs';

// Tips are captured on the platform and HELD until the staff member finishes
// onboarding. If they never do, we must not sit on the money indefinitely — it
// is refunded to the customer after this many days. 90 keeps us safely within
// Stripe's ~180-day card-refund window (a refund to an expired/closed card
// fails beyond that). Configurable via env to tune without a deploy.
const EXPIRY_DAYS = Number(process.env.UNCLAIMED_TIP_EXPIRY_DAYS ?? 90);

// Refund each still-held allocation whose tip was captured before the cutoff.
// Partial refunds per allocation (idempotency key `expire:<rowId>`) keep group
// tips correct: only the unclaimed shares are returned; shares already
// transferred to onboarded colleagues are untouched.
export async function POST(req: Request) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const service = createServiceClient();
  const cutoff = new Date(Date.now() - EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: rowsRaw } = await service
    .from('group_tip_transfers')
    .select('id, amount, transactions!inner(id, stripe_charge_id, succeeded_at, refunded_amount)')
    .eq('status', 'pending')
    .is('stripe_transfer_id', null)
    .lt('transactions.succeeded_at', cutoff)
    .not('transactions.stripe_charge_id', 'is', null)
    .limit(200);

  const rows = (rowsRaw ?? []) as unknown as Array<{
    id: string;
    amount: number;
    transactions: { id: string; stripe_charge_id: string | null; refunded_amount: number | null } | null;
  }>;

  let refunded = 0;
  let failed = 0;

  for (const r of rows) {
    const chargeId = r.transactions?.stripe_charge_id;
    if (!chargeId) {
      failed++;
      continue;
    }
    try {
      await stripe.refunds.create(
        {
          charge: chargeId,
          amount: r.amount,
          metadata: { reason: 'unclaimed_tip_expired', allocation: r.id },
        },
        { idempotencyKey: `expire:${r.id}` }
      );
      await service
        .from('group_tip_transfers')
        .update({ status: 'reversed', reversed_at: new Date().toISOString(), error: 'unclaimed_tip_expired' } as never)
        .eq('id', r.id);
      // Keep the parent transaction's refunded_amount roughly in sync for the
      // admin views (best-effort; Stripe remains the source of truth).
      const prev = r.transactions?.refunded_amount ?? 0;
      await service
        .from('transactions')
        .update({ refunded_amount: prev + r.amount } as never)
        .eq('id', r.transactions!.id);
      refunded++;
    } catch (err) {
      console.error('unclaimed tip expiry refund failed', { rowId: r.id, err });
      failed++;
    }
  }

  return NextResponse.json({ ok: true, scanned: rows.length, refunded, failed, expiryDays: EXPIRY_DAYS });
}

// Vercel cron uses GET with the same auth header.
export const GET = POST;
