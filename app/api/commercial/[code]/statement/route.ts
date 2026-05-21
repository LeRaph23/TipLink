import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { authenticateCommercialRequest } from '@/lib/auth/commercial-session';

export const runtime = 'nodejs';

type Entry = {
  id: string;
  kind: 'commission' | 'payout';
  label: string;
  amountCents: number;
  date: string;
  status: 'pending' | 'paid' | 'failed' | null;
};

// GET — chronological ledger: every commission credit and every withdrawal,
// signed so the running sum gives the current withdrawable balance.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const commercialId = authenticateCommercialRequest(request, code);
  if (!commercialId) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const service = createServiceClient();

  const [salesRes, payoutRes] = await Promise.all([
    service
      .from('commercial_sales')
      .select('id, pack, commission_amount, salon_name_partial, created_at')
      .eq('commercial_id', commercialId)
      .is('voided_at', null),
    service
      .from('commercial_payouts')
      .select('id, amount_cents, status, stripe_transfer_id, requested_at, paid_at')
      .eq('commercial_id', commercialId)
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

  for (const p of payoutRes.data ?? []) {
    const committed =
      p.status === 'pending' || p.status === 'paid' || (p.status === 'failed' && !!p.stripe_transfer_id);
    if (!committed) continue;
    entries.push({
      id: `payout:${p.id}`,
      kind: 'payout',
      label: 'Virement vers votre IBAN',
      amountCents: -p.amount_cents,
      date: p.paid_at ?? p.requested_at,
      status: p.status as 'pending' | 'paid' | 'failed',
    });
  }

  entries.sort((a, b) => b.date.localeCompare(a.date));

  const available = entries.reduce((sum, e) => sum + e.amountCents, 0);
  return NextResponse.json({ available, entries });
}
