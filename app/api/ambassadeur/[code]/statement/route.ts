import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { verifyCookieValue } from '../auth/route';

export const runtime = 'nodejs';

type Entry = {
  id: string;
  kind: 'commission' | 'bonus' | 'referral' | 'payout';
  label: string;
  amountCents: number; // signed: + credit, − debit
  date: string;
  status: 'credited' | 'pending' | 'paid' | 'failed' | null;
};

function weeklyLabel(periodKey: string): string {
  const d = new Date(`${periodKey}T00:00:00Z`);
  const day = isNaN(d.getTime())
    ? periodKey
    : d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', timeZone: 'UTC' });
  return `Bonus hebdo · semaine du ${day}`;
}

function monthlyLabel(periodKey: string): string {
  const d = new Date(`${periodKey}-01T00:00:00Z`);
  const month = isNaN(d.getTime())
    ? periodKey
    : d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return `Défi mensuel · ${month}`;
}

const REFERRAL_LABELS: Record<string, string> = {
  validation: 'Prime de parrainage',
  milestone_5: 'Palier parrainage · 5 filleuls',
  milestone_10: 'Palier parrainage · 10 filleuls',
};

// GET — chronological account statement: every credit (commission, validated
// bonus, validated referral reward) and debit (withdrawal) that makes up the
// ambassador's withdrawable balance.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const cookieValue = request.cookies.get('amb_session')?.value;
  if (!cookieValue) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const secret = process.env.AMBASSADOR_SESSION_SECRET;
  if (!secret) return NextResponse.json({ error: 'Configuration manquante' }, { status: 500 });

  const { valid, ambassadorId } = verifyCookieValue(cookieValue, code, secret);
  if (!valid || !ambassadorId) return NextResponse.json({ error: 'Session invalide' }, { status: 401 });

  const service = createServiceClient();

  const [salesRes, bonusRes, referralRes, payoutRes] = await Promise.all([
    service
      .from('ambassador_sales')
      .select('id, pack, commission_amount, salon_name_partial, created_at')
      .eq('ambassador_id', ambassadorId)
      .is('voided_at', null),
    service
      .from('ambassador_bonus_credits')
      .select('id, kind, period_key, amount_cents, credited_at')
      .eq('ambassador_id', ambassadorId),
    service
      .from('referral_payouts')
      .select('id, reason, amount_cents, credited_at, created_at')
      .eq('referrer_ambassador_id', ambassadorId)
      .eq('status', 'credited'),
    service
      .from('ambassador_payouts')
      .select('id, amount_cents, status, mangopay_transfer_id, requested_at, paid_at')
      .eq('ambassador_id', ambassadorId)
      .in('status', ['pending', 'paid', 'failed']),
  ]);

  const entries: Entry[] = [];

  for (const s of salesRes.data ?? []) {
    entries.push({
      id: `sale:${s.id}`,
      kind: 'commission',
      label: `Commission vente ${s.pack === 'duo' ? 'Duo' : 'Solo'}${s.salon_name_partial ? ` · ${s.salon_name_partial}` : ''}`,
      amountCents: s.commission_amount,
      date: s.created_at,
      status: null,
    });
  }

  for (const b of bonusRes.data ?? []) {
    entries.push({
      id: `bonus:${b.id}`,
      kind: 'bonus',
      label: b.kind === 'monthly_challenge' ? monthlyLabel(b.period_key) : weeklyLabel(b.period_key),
      amountCents: b.amount_cents,
      date: b.credited_at,
      status: 'credited',
    });
  }

  for (const r of referralRes.data ?? []) {
    entries.push({
      id: `referral:${r.id}`,
      kind: 'referral',
      label: REFERRAL_LABELS[r.reason] ?? 'Prime de parrainage',
      amountCents: r.amount_cents,
      date: r.credited_at ?? r.created_at,
      status: 'credited',
    });
  }

  for (const p of payoutRes.data ?? []) {
    // A failed payout whose Stripe transfer never went through did not move
    // money — it does not belong in the balance ledger.
    const committed =
      p.status === 'pending' || p.status === 'paid' || (p.status === 'failed' && !!p.mangopay_transfer_id);
    if (!committed) continue;
    entries.push({
      id: `payout:${p.id}`,
      kind: 'payout',
      label: 'Virement sur ton IBAN',
      amountCents: -p.amount_cents,
      date: p.paid_at ?? p.requested_at,
      status: p.status as 'pending' | 'paid' | 'failed',
    });
  }

  entries.sort((a, b) => b.date.localeCompare(a.date));

  const available = entries.reduce((sum, e) => sum + e.amountCents, 0);

  return NextResponse.json({ available, entries });
}
