import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { stripe } from '@/lib/stripe/client';
import { authenticateCommercialRequest } from '@/lib/auth/commercial-session';
import { COMMERCIAL_MIN_PAYOUT_CENTS } from '@/lib/commercial-tiers';

export const runtime = 'nodejs';

async function computeAvailableCents(commercialId: string): Promise<{
  available: number;
  earnedTotal: number;
  paidOrPendingTotal: number;
}> {
  const service = createServiceClient();

  const [{ data: sales }, { data: payouts }] = await Promise.all([
    service
      .from('commercial_sales')
      .select('commission_amount')
      .eq('commercial_id', commercialId)
      .is('voided_at', null),
    service
      .from('commercial_payouts')
      .select('amount_cents, status, stripe_transfer_id')
      .eq('commercial_id', commercialId)
      .in('status', ['pending', 'paid', 'failed']),
  ]);

  const earnedTotal = (sales ?? []).reduce((s, r) => s + r.commission_amount, 0);

  // A `failed` payout whose Stripe transfer DID succeed still counts as
  // committed — the money has left the platform. Only failed-without-transfer
  // payouts free their amount back into the balance.
  const paidOrPendingTotal = (payouts ?? [])
    .filter((p) =>
      p.status === 'pending' ||
      p.status === 'paid' ||
      (p.status === 'failed' && p.stripe_transfer_id),
    )
    .reduce((s, p) => s + p.amount_cents, 0);

  const available = Math.max(0, earnedTotal - paidOrPendingTotal);
  return { available, earnedTotal, paidOrPendingTotal };
}

// GET — return available balance + payout history
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const commercialId = authenticateCommercialRequest(req, code);
  if (!commercialId) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }

  const service = createServiceClient();
  const { available, earnedTotal, paidOrPendingTotal } = await computeAvailableCents(commercialId);

  const { data: history } = await service
    .from('commercial_payouts')
    .select('id, amount_cents, status, requested_at, paid_at, failure_reason')
    .eq('commercial_id', commercialId)
    .order('requested_at', { ascending: false })
    .limit(20);

  return NextResponse.json({
    available,
    earnedTotal,
    paidOrPendingTotal,
    minPayoutCents: COMMERCIAL_MIN_PAYOUT_CENTS,
    history: history ?? [],
  });
}

// POST — request a payout of the full available balance. Serialized via an
// advisory lock + partial unique index — two concurrent POSTs cannot both
// open a pending payout for the same commercial.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const commercialId = authenticateCommercialRequest(req, code);
  if (!commercialId) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }

  const service = createServiceClient();

  const { data: com } = await service
    .from('commerciaux')
    .select('id, stripe_account_id, name, is_active, payouts_frozen')
    .eq('id', commercialId)
    .maybeSingle();

  if (!com) return NextResponse.json({ error: 'Commercial introuvable' }, { status: 404 });
  if (!com.is_active) {
    return NextResponse.json({ error: 'Compte désactivé. Contactez Digitip.' }, { status: 403 });
  }
  if (com.payouts_frozen) {
    return NextResponse.json(
      { error: 'Vos virements sont temporairement gelés. Contactez Digitip.' },
      { status: 403 },
    );
  }
  if (!com.stripe_account_id) {
    return NextResponse.json(
      { error: "Configurez d'abord votre compte bancaire (Stripe Connect)." },
      { status: 400 },
    );
  }

  // RPC types lag the migration that introduced them — cast minimally so the
  // build stays clean without regenerating.
  const tryLock = (service.rpc.bind(service) as unknown as (
    fn: 'try_advisory_lock_commercial_payout',
    args: { p_commercial_id: string },
  ) => Promise<{ data: boolean | null; error: unknown }>);
  const { data: lockAcquired } = await tryLock('try_advisory_lock_commercial_payout', {
    p_commercial_id: commercialId,
  });
  if (!lockAcquired) {
    return NextResponse.json(
      { error: 'Demande déjà en cours, réessayez dans un instant.' },
      { status: 409 },
    );
  }

  try {
    const { available } = await computeAvailableCents(commercialId);

    if (available < COMMERCIAL_MIN_PAYOUT_CENTS) {
      return NextResponse.json({
        error: `Solde insuffisant (${(available / 100).toFixed(2)} €). Minimum ${COMMERCIAL_MIN_PAYOUT_CENTS / 100} € pour un virement.`,
      }, { status: 400 });
    }

    const { data: inserted, error: insErr } = await service
      .from('commercial_payouts')
      .insert({
        commercial_id: commercialId,
        amount_cents: available,
        status: 'pending',
      })
      .select('id, amount_cents')
      .single();

    if (insErr || !inserted) {
      if (insErr && (insErr as { code?: string }).code === '23505') {
        return NextResponse.json({ error: 'Demande déjà en cours.' }, { status: 409 });
      }
      console.error('commercial payout insert failed', insErr);
      return NextResponse.json({ error: 'Erreur enregistrement de la demande' }, { status: 500 });
    }

    try {
      const transfer = await stripe.transfers.create({
        amount: inserted.amount_cents,
        currency: 'eur',
        destination: com.stripe_account_id,
        metadata: { commercial_id: commercialId, payout_id: inserted.id },
      }, { idempotencyKey: `com_payout_transfer:${inserted.id}` });

      await service
        .from('commercial_payouts')
        .update({
          status: 'paid',
          stripe_transfer_id: transfer.id,
          paid_at: new Date().toISOString(),
        })
        .eq('id', inserted.id);

      return NextResponse.json({ ok: true, amount: inserted.amount_cents, status: 'paid' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Stripe error';
      console.error('commercial payout transfer failed', err);
      await service
        .from('commercial_payouts')
        .update({ status: 'failed', failure_reason: msg })
        .eq('id', inserted.id);
      return NextResponse.json({
        ok: false,
        amount: inserted.amount_cents,
        status: 'failed',
        error: 'Le virement a échoué — un administrateur va reprendre la demande.',
      }, { status: 502 });
    }
  } finally {
    const releaseLock = (service.rpc.bind(service) as unknown as (
      fn: 'release_advisory_lock_commercial_payout',
      args: { p_commercial_id: string },
    ) => Promise<unknown>);
    await releaseLock('release_advisory_lock_commercial_payout', { p_commercial_id: commercialId });
  }
}
