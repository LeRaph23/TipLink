import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { stripe } from '@/lib/stripe/client';
import { verifyCookieValue } from '../auth/route';
import {
  computeTotalBaseCommission,
  computeClosedWeekBonuses,
  MIN_PAYOUT_CENTS,
} from '@/lib/ambassador-tiers';
import { sumCreditedReferralCents } from '@/lib/referrals';

export const runtime = 'nodejs';

async function authenticate(req: NextRequest, code: string) {
  const cookieValue = req.cookies.get('amb_session')?.value;
  if (!cookieValue) return null;
  const secret = process.env.AMBASSADOR_SESSION_SECRET;
  if (!secret) return null;
  const { valid, ambassadorId } = verifyCookieValue(cookieValue, code, secret);
  return valid && ambassadorId ? ambassadorId : null;
}

async function computeAvailableCents(ambassadorId: string): Promise<{
  available: number;
  earnedTotal: number;
  paidOrPendingTotal: number;
}> {
  const service = createServiceClient();

  const [{ data: sales }, { data: payouts }, referralCredited] = await Promise.all([
    // Voided sales (refunded / charged-back / canceled orders) earn no
    // commission and must never count toward the withdrawable balance.
    service
      .from('ambassador_sales')
      .select('commission_amount, created_at')
      .eq('ambassador_id', ambassadorId)
      .is('voided_at', null),
    service
      .from('ambassador_payouts')
      .select('amount_cents, status, stripe_transfer_id')
      .eq('ambassador_id', ambassadorId)
      .in('status', ['pending', 'paid', 'failed']),
    // Referral rewards a super-admin has credited to this ambassador as a
    // parrain — these add to the withdrawable balance.
    sumCreditedReferralCents(service, ambassadorId),
  ]);

  const baseCommission = computeTotalBaseCommission(sales ?? []);
  const closedBonuses = computeClosedWeekBonuses(sales ?? []);
  const earnedTotal = baseCommission + closedBonuses + referralCredited;
  // A `failed` payout frees its amount back into the balance — UNLESS the
  // Stripe transfer leg already went through (the platform-side money has
  // left). Counting a failed-with-transfer payout as committed prevents a
  // second payout request from transferring the same funds twice.
  const paidOrPendingTotal = (payouts ?? [])
    .filter((p) =>
      p.status === 'pending' ||
      p.status === 'paid' ||
      (p.status === 'failed' && p.stripe_transfer_id)
    )
    .reduce((s, p) => s + p.amount_cents, 0);
  const available = Math.max(0, earnedTotal - paidOrPendingTotal);

  return { available, earnedTotal, paidOrPendingTotal };
}

// GET — return available balance + payout history
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const ambassadorId = await authenticate(req, code);
  if (!ambassadorId) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }

  const service = createServiceClient();
  const { available, earnedTotal, paidOrPendingTotal } = await computeAvailableCents(ambassadorId);

  const { data: history } = await service
    .from('ambassador_payouts')
    .select('id, amount_cents, status, requested_at, paid_at')
    .eq('ambassador_id', ambassadorId)
    .order('requested_at', { ascending: false })
    .limit(20);

  return NextResponse.json({
    available,
    earnedTotal,
    paidOrPendingTotal,
    minPayoutCents: MIN_PAYOUT_CENTS,
    history: history ?? [],
  });
}

// POST — request a payout for the full available balance.
// Serialized via a Postgres advisory lock + a partial unique index on
// (ambassador_id) WHERE status='pending'. Two concurrent POSTs cannot both
// create a pending payout for the same ambassador.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const ambassadorId = await authenticate(req, code);
  if (!ambassadorId) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }

  const service = createServiceClient();

  const { data: amb } = await service
    .from('ambassadors')
    .select('id, stripe_account_id, name, is_active, payouts_frozen')
    .eq('id', ambassadorId)
    .maybeSingle();

  if (!amb) return NextResponse.json({ error: 'Ambassadeur introuvable' }, { status: 404 });
  // Re-check status at payout time: a session cookie stays valid for 7 days,
  // so a super-admin who deactivates or freezes an ambassador (e.g. after
  // spotting fraud) must still block any in-flight withdrawal.
  if (!amb.is_active) {
    return NextResponse.json(
      { error: 'Compte désactivé. Contacte Digitip.' },
      { status: 403 }
    );
  }
  if (amb.payouts_frozen) {
    return NextResponse.json(
      { error: 'Tes virements sont temporairement gelés. Contacte Digitip.' },
      { status: 403 }
    );
  }
  if (!amb.stripe_account_id) {
    return NextResponse.json(
      { error: 'Configure d\'abord ton compte bancaire (RIB + SIRET).' },
      { status: 400 }
    );
  }

  // Acquire the advisory lock — short-circuits parallel requests immediately.
  // RPCs aren't in the generated types yet; cast minimally.
  const tryLock = (service.rpc as unknown as (
    fn: 'try_advisory_lock_payout',
    args: { p_ambassador_id: string }
  ) => Promise<{ data: boolean | null; error: unknown }>);
  const { data: lockAcquired } = await tryLock('try_advisory_lock_payout', {
    p_ambassador_id: ambassadorId,
  });
  if (!lockAcquired) {
    return NextResponse.json({ error: 'Demande déjà en cours, réessaye dans un instant.' }, { status: 409 });
  }

  try {
    const { available } = await computeAvailableCents(ambassadorId);

    if (available < MIN_PAYOUT_CENTS) {
      return NextResponse.json({
        error: `Solde insuffisant (${(available / 100).toFixed(2)} €). Minimum 30 € pour un virement.`,
      }, { status: 400 });
    }

    const { data: inserted, error: insErr } = await service
      .from('ambassador_payouts')
      .insert({
        ambassador_id: ambassadorId,
        amount_cents: available,
        status: 'pending',
      })
      .select('id, amount_cents')
      .single();

    if (insErr || !inserted) {
      // 23505 = unique violation on (ambassador_id) WHERE status='pending'.
      if (insErr && (insErr as { code?: string }).code === '23505') {
        return NextResponse.json({ error: 'Demande déjà en cours.' }, { status: 409 });
      }
      console.error('ambassador payout insert failed', insErr);
      return NextResponse.json({ error: 'Erreur enregistrement de la demande' }, { status: 500 });
    }

    // Trigger the Stripe transfer + payout. On failure mark `failed` so the
    // payout doesn't stay pending forever — super-admin can retry from admin UI.
    //
    // The transfer (platform → connected account) and the payout (connected
    // account → bank) are two calls. If the transfer succeeds but the payout
    // fails, the platform-side money has already moved: we MUST persist the
    // transfer id so computeAvailableCents counts it as committed, otherwise a
    // retry would transfer the same funds a second time.
    let transferId: string | null = null;
    try {
      const transfer = await stripe.transfers.create({
        amount: inserted.amount_cents,
        currency: 'eur',
        destination: amb.stripe_account_id,
        metadata: { ambassador_id: ambassadorId, payout_id: inserted.id },
      }, { idempotencyKey: `amb_payout_transfer:${inserted.id}` });
      transferId = transfer.id;

      const payout = await stripe.payouts.create(
        { amount: inserted.amount_cents, currency: 'eur', method: 'standard' },
        { stripeAccount: amb.stripe_account_id, idempotencyKey: `amb_payout:${inserted.id}` }
      );

      await service
        .from('ambassador_payouts')
        .update({
          status: 'paid',
          stripe_transfer_id: transfer.id,
          stripe_payout_id: payout.id,
          paid_at: new Date().toISOString(),
        })
        .eq('id', inserted.id);

      return NextResponse.json({ ok: true, amount: inserted.amount_cents, status: 'paid' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Stripe error';
      console.error('ambassador payout stripe call failed', err);
      await service
        .from('ambassador_payouts')
        .update({
          status: 'failed',
          failure_reason: msg,
          stripe_transfer_id: transferId,
        })
        .eq('id', inserted.id);
      return NextResponse.json({
        ok: false,
        amount: inserted.amount_cents,
        status: 'failed',
        error: 'Le virement a échoué — un administrateur va reprendre la demande.',
      }, { status: 502 });
    }
  } finally {
    const releaseLock = (service.rpc as unknown as (
      fn: 'release_advisory_lock_payout',
      args: { p_ambassador_id: string }
    ) => Promise<unknown>);
    await releaseLock('release_advisory_lock_payout', { p_ambassador_id: ambassadorId });
  }
}
