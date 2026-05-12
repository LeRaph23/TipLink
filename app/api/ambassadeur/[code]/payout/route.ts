import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { stripe } from '@/lib/stripe/client';
import { verifyCookieValue } from '../auth/route';
import {
  computeTotalBaseCommission,
  computeClosedWeekBonuses,
  MIN_PAYOUT_CENTS,
} from '@/lib/ambassador-tiers';

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

  const [{ data: sales }, { data: payouts }] = await Promise.all([
    service
      .from('ambassador_sales')
      .select('commission_amount, created_at')
      .eq('ambassador_id', ambassadorId),
    service
      .from('ambassador_payouts')
      .select('amount_cents, status')
      .eq('ambassador_id', ambassadorId)
      .in('status', ['pending', 'paid']),
  ]);

  const baseCommission = computeTotalBaseCommission(sales ?? []);
  const closedBonuses = computeClosedWeekBonuses(sales ?? []);
  const earnedTotal = baseCommission + closedBonuses;
  const paidOrPendingTotal = (payouts ?? []).reduce((s, p) => s + p.amount_cents, 0);
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

// POST — request a payout for the full available balance
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
    .select('id, stripe_account_id, name')
    .eq('id', ambassadorId)
    .maybeSingle();

  if (!amb) return NextResponse.json({ error: 'Ambassadeur introuvable' }, { status: 404 });
  if (!amb.stripe_account_id) {
    return NextResponse.json(
      { error: 'Configure d\'abord ton compte bancaire (RIB + SIRET).' },
      { status: 400 }
    );
  }

  const { available } = await computeAvailableCents(ambassadorId);

  if (available < MIN_PAYOUT_CENTS) {
    return NextResponse.json({
      error: `Solde insuffisant (${(available / 100).toFixed(2)} €). Minimum 30 € pour un virement.`,
    }, { status: 400 });
  }

  // Record the payout request in DB. Transfer + Payout itself will be triggered
  // by the super-admin from the admin panel (manual settlement) to keep
  // platform-balance moves auditable.
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
    console.error('ambassador payout insert failed', insErr);
    return NextResponse.json({ error: 'Erreur enregistrement de la demande' }, { status: 500 });
  }

  // Best-effort: trigger the Stripe transfer + payout immediately. If it fails,
  // we keep the request as `pending` and the super-admin can retry/mark paid.
  try {
    const transfer = await stripe.transfers.create({
      amount: inserted.amount_cents,
      currency: 'eur',
      destination: amb.stripe_account_id,
      metadata: { ambassador_id: ambassadorId, payout_id: inserted.id },
    });

    const payout = await stripe.payouts.create(
      { amount: inserted.amount_cents, currency: 'eur', method: 'standard' },
      { stripeAccount: amb.stripe_account_id }
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
    // Keep as pending; super-admin will resolve.
    return NextResponse.json({
      ok: true,
      amount: inserted.amount_cents,
      status: 'pending',
      note: `Virement en attente de validation par l'administrateur. (${msg})`,
    });
  }
}
