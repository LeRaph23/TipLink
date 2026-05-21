import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { authenticateCommercialRequest } from '@/lib/auth/commercial-session';
import { COMMERCIAL_COMMISSION_BY_PACK } from '@/lib/commercial-tiers';

export const runtime = 'nodejs';

function startOfWeek(d: Date): Date {
  // ISO week: Monday 00:00 local time.
  const dayIndex = (d.getDay() + 6) % 7;
  const start = new Date(d);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - dayIndex);
  return start;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const commercialId = authenticateCommercialRequest(request, code);
  if (!commercialId) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }

  const supabase = createServiceClient();

  const [{ data: commercial }, { data: sales }] = await Promise.all([
    supabase
      .from('commerciaux')
      .select('id, name, company_name, is_active, payouts_frozen')
      .eq('id', commercialId)
      .single(),
    supabase
      .from('commercial_sales')
      .select('id, pack, commission_amount, salon_name_partial, created_at')
      .eq('commercial_id', commercialId)
      .is('voided_at', null)
      .order('created_at', { ascending: false }),
  ]);

  if (!commercial?.is_active) {
    return NextResponse.json({ error: 'Compte inactif' }, { status: 403 });
  }

  const allSales = sales ?? [];
  const now = new Date();
  const weekStart = startOfWeek(now);
  const monthStart = startOfMonth(now);

  const weekSales = allSales.filter(s => new Date(s.created_at) >= weekStart);
  const monthSales = allSales.filter(s => new Date(s.created_at) >= monthStart);

  const totalCommission = allSales.reduce((sum, s) => sum + s.commission_amount, 0);
  const weekCommission = weekSales.reduce((sum, s) => sum + s.commission_amount, 0);
  const monthCommission = monthSales.reduce((sum, s) => sum + s.commission_amount, 0);

  const soloCount = allSales.filter(s => s.pack === 'solo').length;
  const duoCount = allSales.filter(s => s.pack === 'duo').length;

  return NextResponse.json({
    name: commercial.name,
    companyName: commercial.company_name,
    payoutsFrozen: commercial.payouts_frozen,
    allTimeSalesCount: allSales.length,
    weekCount: weekSales.length,
    monthCount: monthSales.length,
    soloCount,
    duoCount,
    totalCommission,
    weekCommission,
    monthCommission,
    grid: {
      soloCents: COMMERCIAL_COMMISSION_BY_PACK.solo,
      duoCents: COMMERCIAL_COMMISSION_BY_PACK.duo,
    },
    recentSales: allSales.slice(0, 15).map(s => ({
      id: s.id,
      pack: s.pack,
      commission_amount: s.commission_amount,
      salon_name_partial: s.salon_name_partial,
      created_at: s.created_at,
    })),
  });
}
