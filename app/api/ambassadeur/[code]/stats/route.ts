import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { verifyCookieValue } from '../auth/route';
import {
  getWeekBounds,
  getWeeklyTier,
  computeTotalBaseCommission,
  computeClosedWeekBonuses,
  WEEKLY_TIERS,
} from '@/lib/ambassador-tiers';
import { getActiveChallenge } from '@/lib/ambassador-monthly-challenge';
import { sumCreditedReferralCents } from '@/lib/referrals';
import { sumCreditedBonusCents } from '@/lib/ambassadeur/bonuses';

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
    // Only live sales: voided rows (refunded / charged-back / canceled orders)
    // earn no commission and must not count toward tiers or the leaderboard.
    supabase
      .from('ambassador_sales')
      .select('id, pack, commission_amount, salon_name_partial, created_at')
      .eq('ambassador_id', ambassadorId)
      .is('voided_at', null)
      .order('created_at', { ascending: false }),
  ]);

  if (!ambassador?.is_active) {
    return NextResponse.json({ error: 'Compte inactif' }, { status: 403 });
  }

  const now = new Date();
  const { start: weekStart, end: weekEnd } = getWeekBounds(now);

  const allSales = sales ?? [];

  const weekSales = allSales.filter((s) => {
    const d = new Date(s.created_at);
    return d >= weekStart && d <= weekEnd;
  });

  const weekCount = weekSales.length;
  const weeklyTier = getWeeklyTier(weekCount);
  const weeklyBonusCents = weeklyTier?.bonus ?? 0;

  const totalBaseCommission = computeTotalBaseCommission(allSales);
  // Closed weekly bonuses earned (informational — bonuses are paid only once a
  // super-admin has validated them; they are NOT automatically withdrawable).
  const closedWeeklyBonuses = computeClosedWeekBonuses(allSales, now);

  // Monthly challenge — surfaced only while a super-admin has one running.
  // When inactive, the competition (prize + leaderboard) is hidden entirely.
  const activeChallenge = await getActiveChallenge(supabase, now);
  let monthlyChallenge: { prizeCents: number; prize: string; endsAt: string } | null = null;
  let leaderboard: {
    rank: number;
    total: number;
    top3: Array<{ rank: number; firstName: string; count: number; isYou: boolean }>;
  } | null = null;
  let monthCount = 0;

  if (activeChallenge) {
    const winStart = new Date(activeChallenge.startsAt);
    const winEnd = new Date(
      Math.min(now.getTime(), new Date(activeChallenge.endsAt).getTime())
    );

    monthCount = allSales.filter((s) => {
      const d = new Date(s.created_at);
      return d >= winStart && d <= winEnd;
    }).length;

    // Leaderboard: every ambassador's non-voided sale count in the window.
    const { data: windowSales } = await supabase
      .from('ambassador_sales')
      .select('ambassador_id')
      .is('voided_at', null)
      .gte('created_at', winStart.toISOString())
      .lte('created_at', winEnd.toISOString());

    const countsByAmbassador: Record<string, number> = {};
    for (const s of windowSales ?? []) {
      countsByAmbassador[s.ambassador_id] = (countsByAmbassador[s.ambassador_id] ?? 0) + 1;
    }

    const ranked = Object.entries(countsByAmbassador).sort(([, a], [, b]) => b - a);
    const rank = ranked.findIndex(([id]) => id === ambassadorId) + 1;
    const total = ranked.length;

    // Top 3 first names + counts, for live competition display
    const topIds = ranked.slice(0, 3).map(([id]) => id);
    const { data: topAmbassadors } = topIds.length > 0
      ? await supabase.from('ambassadors').select('id, name').in('id', topIds)
      : { data: [] };
    const nameById = new Map((topAmbassadors ?? []).map((a) => [a.id, a.name.split(' ')[0]]));
    const top3 = ranked.slice(0, 3).map(([id, count], idx) => ({
      rank: idx + 1,
      firstName: id === ambassadorId ? 'Toi' : (nameById.get(id) ?? '—'),
      count,
      isYou: id === ambassadorId,
    }));

    monthlyChallenge = {
      prizeCents: activeChallenge.prizeCents,
      prize: `${Math.round(activeChallenge.prizeCents / 100)}€ pour le #1 du classement`,
      endsAt: activeChallenge.endsAt,
    };
    leaderboard = {
      rank: rank || total + 1,
      total: Math.max(total, 1),
      top3,
    };
  }

  // Money actually in the withdrawable balance: base commission + the bonuses
  // and referral rewards a super-admin has explicitly credited. Nothing auto.
  const [referralCreditedCents, bonusCreditedCents] = await Promise.all([
    sumCreditedReferralCents(supabase, ambassadorId),
    sumCreditedBonusCents(supabase, ambassadorId),
  ]);
  const earnedTotal = totalBaseCommission + bonusCreditedCents + referralCreditedCents;

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
    monthlyChallenge,
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
    leaderboard,
    closedWeeklyBonuses,
    referralCreditedCents,
    bonusCreditedCents,
    earnedTotal,
    recentSales: allSales.slice(0, 10).map((s) => ({
      id: s.id,
      pack: s.pack,
      commission_amount: s.commission_amount,
      salon_name_partial: s.salon_name_partial,
      created_at: s.created_at,
    })),
    weekBounds: { start: weekStart.toISOString(), end: weekEnd.toISOString() },
  });
}
