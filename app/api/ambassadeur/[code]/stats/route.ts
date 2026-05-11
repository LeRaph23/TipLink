import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { verifyCookieValue } from '../auth/route';
import {
  getWeekBounds,
  getMonthBounds,
  getWeeklyTier,
  computeTotalBaseCommission,
  WEEKLY_TIERS,
  MONTHLY_CHALLENGE,
} from '@/lib/ambassador-tiers';

export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const cookieValue = request.cookies.get('amb_session')?.value;

  if (!cookieValue) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }

  const secret = process.env.AMBASSADOR_SESSION_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'Configuration manquante' }, { status: 500 });
  }

  const { valid, ambassadorId } = verifyCookieValue(cookieValue, code, secret);
  if (!valid || !ambassadorId) {
    return NextResponse.json({ error: 'Session invalide' }, { status: 401 });
  }

  const supabase = createServiceClient();

  // Fetch ambassador info + all sales
  const [{ data: ambassador }, { data: sales }] = await Promise.all([
    supabase
      .from('ambassadors')
      .select('id, name, is_active')
      .eq('id', ambassadorId)
      .single(),
    supabase
      .from('ambassador_sales')
      .select('id, pack, commission_amount, salon_name_partial, created_at')
      .eq('ambassador_id', ambassadorId)
      .order('created_at', { ascending: false }),
  ]);

  if (!ambassador?.is_active) {
    return NextResponse.json({ error: 'Compte inactif' }, { status: 403 });
  }

  const now = new Date();
  const { start: weekStart, end: weekEnd } = getWeekBounds(now);
  const { start: monthStart, end: monthEnd } = getMonthBounds(now);

  const allSales = sales ?? [];

  const weekSales = allSales.filter((s) => {
    const d = new Date(s.created_at);
    return d >= weekStart && d <= weekEnd;
  });

  const monthSales = allSales.filter((s) => {
    const d = new Date(s.created_at);
    return d >= monthStart && d <= monthEnd;
  });

  const weekCount = weekSales.length;
  const monthCount = monthSales.length;

  const weeklyTier = getWeeklyTier(weekCount);
  const weeklyBonusCents = weeklyTier?.bonus ?? 0;
  const monthlyBonusUnlocked = monthCount >= MONTHLY_CHALLENGE.threshold;

  const totalBaseCommission = computeTotalBaseCommission(allSales);

  // Leaderboard: all ambassadors' monthly sale counts, ordered desc
  const { data: allMonthSales } = await supabase
    .from('ambassador_sales')
    .select('ambassador_id')
    .gte('created_at', monthStart.toISOString())
    .lte('created_at', monthEnd.toISOString());

  const countsByAmbassador: Record<string, number> = {};
  for (const s of allMonthSales ?? []) {
    countsByAmbassador[s.ambassador_id] = (countsByAmbassador[s.ambassador_id] ?? 0) + 1;
  }

  const leaderboard = Object.entries(countsByAmbassador)
    .sort(([, a], [, b]) => b - a);

  const leaderboardRank = leaderboard.findIndex(([id]) => id === ambassadorId) + 1;
  const leaderboardTotal = leaderboard.length;

  return NextResponse.json({
    name: ambassador.name,
    allTimeSalesCount: allSales.length,
    weekCount,
    monthCount,
    totalBaseCommission, // cents
    weeklyTier: weeklyTier
      ? { id: weeklyTier.id, label: weeklyTier.label, bonus: weeklyTier.bonus }
      : null,
    weeklyBonusCents,
    monthlyBonusUnlocked,
    monthlyChallenge: MONTHLY_CHALLENGE,
    tiers: WEEKLY_TIERS.map((t) => ({
      id: t.id,
      label: t.label,
      emoji: t.emoji,
      color: t.color,
      bg: t.bg,
      threshold: t.threshold,
      bonus: t.bonus,
      unlocked: weekCount >= t.threshold,
    })),
    leaderboard: {
      rank: leaderboardRank || leaderboardTotal + 1,
      total: Math.max(leaderboardTotal, 1),
    },
    recentSales: allSales.slice(0, 10).map((s) => ({
      id: s.id,
      pack: s.pack,
      commission_amount: s.commission_amount,
      salon_name_partial: s.salon_name_partial,
      created_at: s.created_at,
    })),
    weekBounds: { start: weekStart.toISOString(), end: weekEnd.toISOString() },
    monthBounds: { start: monthStart.toISOString(), end: monthEnd.toISOString() },
  });
}
