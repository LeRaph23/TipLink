import { setRequestLocale } from 'next-intl/server';
import { requireSuperAdmin } from '@/lib/auth/require-super-admin';
import { createServiceClient } from '@/lib/supabase/service';
import { AmbassadeursOverview, type AmbassadorOverviewRow, type PendingPayoutRow } from './AmbassadeursOverview';
import { BonusesPanel, type BonusReviewRow } from './BonusesPanel';
import { ActionCenter } from './ActionCenter';
import { PilotageCharts, type WeeklyPoint } from './PilotageCharts';
import {
  getWeekBounds,
  getMonthBounds,
  getWeeklyTier,
  computeTotalBaseCommission,
  computeClosedWeekBonusBreakdown,
} from '@/lib/ambassador-tiers';
import { getActiveChallenge } from '@/lib/ambassador-monthly-challenge';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function KpiCard({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: boolean }) {
  return (
    <div style={{
      background: 'var(--surface)',
      border: `1px solid ${highlight ? 'var(--accent)' : 'var(--border-subtle)'}`,
      borderRadius: 'var(--radius)', padding: 16,
    }}>
      <div style={{ fontSize: 10.5, fontWeight: 600, color: highlight ? 'var(--accent)' : 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 7 }}>
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 800, color: highlight ? 'var(--accent)' : 'var(--text)', letterSpacing: '-0.03em', lineHeight: 1 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 6 }}>{sub}</div>}
    </div>
  );
}

export default async function AdminAmbassadeursPilotagePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireSuperAdmin(locale);

  const service = createServiceClient();

  const { data: ambassadors } = await service
    .from('ambassadors')
    .select('id, name, is_active, created_at, stripe_account_id, siret')
    .order('created_at', { ascending: false });

  // Non-voided sales only — commissions, bonuses and leaderboards must reflect
  // revenue actually kept.
  const { data: salesRows } = await service
    .from('ambassador_sales')
    .select('ambassador_id, commission_amount, created_at')
    .is('voided_at', null);

  const { data: payoutsRowsRaw } = await service
    .from('ambassador_payouts')
    .select('id, ambassador_id, amount_cents, status, stripe_transfer_id, requested_at')
    .in('status', ['pending', 'paid', 'failed']);

  // A `failed` payout is money-out only once its Stripe transfer went through.
  const payoutsRows = (payoutsRowsRaw ?? []).filter(
    (p) => p.status === 'pending' || p.status === 'paid' || (p.status === 'failed' && p.stripe_transfer_id)
  );

  const { data: referralPayouts } = await service
    .from('referral_payouts')
    .select('referrer_ambassador_id, amount_cents, status');

  const { data: bonusCreditRows } = await service
    .from('ambassador_bonus_credits')
    .select('ambassador_id, kind, period_key, amount_cents');

  const [{ count: pendingReferralCount }, { count: pendingApplicationCount }] = await Promise.all([
    service.from('referral_payouts').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    service.from('ambassador_recruitment_applications').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
  ]);

  const now = new Date();
  const { start: weekStart, end: weekEnd } = getWeekBounds(now);
  const { start: monthStart, end: monthEnd } = getMonthBounds(now);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);

  const activeChallenge = await getActiveChallenge(service, now);
  const lbStart = activeChallenge ? new Date(activeChallenge.startsAt) : monthStart;
  const lbEnd = activeChallenge
    ? new Date(Math.min(now.getTime(), new Date(activeChallenge.endsAt).getTime()))
    : monthEnd;

  const weekCountByAmb: Record<string, number> = {};
  const monthCountByAmb: Record<string, number> = {};
  const lbCountByAmb: Record<string, number> = {};
  const salesByAmb: Record<string, Array<{ commission_amount: number; created_at: string }>> = {};
  let sales30d = 0;

  // 10 weekly buckets ending with the current week, for the trend chart.
  const WEEKS = 10;
  const weekBuckets = Array.from({ length: WEEKS }, (_, i) => {
    const start = new Date(weekStart.getTime() - (WEEKS - 1 - i) * 7 * 86400000);
    return { start, end: new Date(start.getTime() + 7 * 86400000), count: 0, commission: 0 };
  });

  for (const s of salesRows ?? []) {
    (salesByAmb[s.ambassador_id] ??= []).push({ commission_amount: s.commission_amount, created_at: s.created_at });
    const d = new Date(s.created_at);
    if (d >= weekStart && d <= weekEnd) weekCountByAmb[s.ambassador_id] = (weekCountByAmb[s.ambassador_id] ?? 0) + 1;
    if (d >= monthStart && d <= monthEnd) monthCountByAmb[s.ambassador_id] = (monthCountByAmb[s.ambassador_id] ?? 0) + 1;
    if (d >= lbStart && d <= lbEnd) lbCountByAmb[s.ambassador_id] = (lbCountByAmb[s.ambassador_id] ?? 0) + 1;
    if (d >= thirtyDaysAgo) sales30d += 1;
    for (const b of weekBuckets) {
      if (d >= b.start && d < b.end) { b.count += 1; b.commission += s.commission_amount; break; }
    }
  }

  const weekly: WeeklyPoint[] = weekBuckets.map((b) => ({
    label: b.start.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }),
    ventes: b.count,
    commission: Math.round(b.commission / 100),
  }));

  const paidOrPendingByAmb: Record<string, number> = {};
  for (const p of payoutsRows) {
    paidOrPendingByAmb[p.ambassador_id] = (paidOrPendingByAmb[p.ambassador_id] ?? 0) + p.amount_cents;
  }

  const creditedReferralByReferrer: Record<string, number> = {};
  for (const p of referralPayouts ?? []) {
    if (p.status === 'credited') {
      creditedReferralByReferrer[p.referrer_ambassador_id] =
        (creditedReferralByReferrer[p.referrer_ambassador_id] ?? 0) + p.amount_cents;
    }
  }

  const creditedBonusKeys = new Set((bonusCreditRows ?? []).map((c) => `${c.ambassador_id}|${c.kind}|${c.period_key}`));
  const creditedBonusByAmb: Record<string, number> = {};
  for (const c of bonusCreditRows ?? []) {
    creditedBonusByAmb[c.ambassador_id] = (creditedBonusByAmb[c.ambassador_id] ?? 0) + c.amount_cents;
  }

  const nameById = new Map((ambassadors ?? []).map((a) => [a.id, a.name]));

  const fmtDay = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long' });
  const fmtMonthOf = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

  const bonusReviewRows: BonusReviewRow[] = [];
  for (const a of ambassadors ?? []) {
    for (const w of computeClosedWeekBonusBreakdown(salesByAmb[a.id] ?? [], now)) {
      bonusReviewRows.push({
        key: `${a.id}|weekly_tier|${w.periodKey}`,
        ambassadorId: a.id,
        ambassadorName: a.name,
        kind: 'weekly_tier',
        periodKey: w.periodKey,
        label: `Palier ${w.tierLabel} · semaine du ${fmtDay(w.weekStartIso)}`,
        detail: `${w.count} ventes`,
        amountCents: w.bonusCents,
        credited: creditedBonusKeys.has(`${a.id}|weekly_tier|${w.periodKey}`),
      });
    }
  }

  const { data: settledChallenges } = await service
    .from('ambassador_monthly_challenges')
    .select('id, prize_cents, winner_ambassador_id, winner_sales_count, starts_at')
    .eq('status', 'settled')
    .not('winner_ambassador_id', 'is', null);
  for (const ch of settledChallenges ?? []) {
    const winnerId = ch.winner_ambassador_id;
    if (!winnerId) continue;
    bonusReviewRows.push({
      key: `${winnerId}|monthly_challenge|${ch.id}`,
      ambassadorId: winnerId,
      ambassadorName: nameById.get(winnerId) ?? '—',
      kind: 'monthly_challenge',
      periodKey: ch.id,
      label: `Défi mensuel · ${fmtMonthOf(ch.starts_at)}`,
      detail: `${ch.winner_sales_count ?? 0} ventes · #1`,
      amountCents: ch.prize_cents,
      credited: creditedBonusKeys.has(`${winnerId}|monthly_challenge|${ch.id}`),
    });
  }
  bonusReviewRows.sort((x, y) => Number(x.credited) - Number(y.credited) || x.label.localeCompare(y.label));

  const overviewRows: AmbassadorOverviewRow[] = (ambassadors ?? []).map((a) => {
    const allSales = salesByAmb[a.id] ?? [];
    const wkCount = weekCountByAmb[a.id] ?? 0;
    const tier = getWeeklyTier(wkCount);
    const base = computeTotalBaseCommission(allSales);
    const earned = base + (creditedBonusByAmb[a.id] ?? 0) + (creditedReferralByReferrer[a.id] ?? 0);
    const paid = paidOrPendingByAmb[a.id] ?? 0;
    return {
      id: a.id,
      name: a.name,
      weekCount: wkCount,
      monthCount: monthCountByAmb[a.id] ?? 0,
      weeklyTier: tier ? { label: tier.label, emoji: tier.emoji, bonus: tier.bonus } : null,
      earnedTotalCents: earned,
      paidOrPendingCents: paid,
      availableCents: Math.max(0, earned - paid),
      hasStripeAccount: !!a.stripe_account_id,
      siret: a.siret ?? null,
    };
  });

  const monthLeaderboard = Object.entries(lbCountByAmb)
    .map(([id, count]) => ({ id, name: nameById.get(id) ?? '—', count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const { data: pendingRowsRaw } = await service
    .from('ambassador_payouts')
    .select('id, ambassador_id, amount_cents, status, requested_at')
    .eq('status', 'pending')
    .order('requested_at', { ascending: true });

  const pendingPayouts: PendingPayoutRow[] = (pendingRowsRaw ?? []).map((p) => ({
    id: p.id,
    ambassador_id: p.ambassador_id,
    ambassador_name: nameById.get(p.ambassador_id) ?? '—',
    amount_cents: p.amount_cents,
    status: p.status,
    requested_at: p.requested_at,
  }));

  const totalCommission = (salesRows ?? []).reduce((s, r) => s + r.commission_amount, 0);
  const activeCount = (ambassadors ?? []).filter((a) => a.is_active).length;
  const totalCount = (ambassadors ?? []).length;
  const bonusesToReview = bonusReviewRows.filter((r) => !r.credited).length;

  const counts = {
    payouts: pendingPayouts.length,
    bonuses: bonusesToReview,
    referrals: pendingReferralCount ?? 0,
    applications: pendingApplicationCount ?? 0,
  };

  return (
    <div>
      <div className="dash-kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 28 }}>
        <KpiCard label="Ambassadeurs actifs" value={String(activeCount)} sub={`sur ${totalCount} au total`} />
        <KpiCard label="Ventes · 30 j" value={String(sales30d)} />
        <KpiCard label="Commissions dues" value={`${Math.round(totalCommission / 100)} €`} sub="base, hors bonus" />
        <KpiCard
          label="Actions en attente"
          value={String(counts.payouts + counts.bonuses + counts.referrals + counts.applications)}
          highlight={counts.payouts + counts.bonuses + counts.referrals + counts.applications > 0}
        />
      </div>

      <ActionCenter counts={counts} />

      <PilotageCharts weekly={weekly} topAmbassadors={monthLeaderboard.map((e) => ({ name: e.name, count: e.count }))} />

      <AmbassadeursOverview
        rows={overviewRows}
        monthLeaderboard={monthLeaderboard}
        pendingPayouts={pendingPayouts}
        monthlyChallenge={
          activeChallenge ? { endsAt: activeChallenge.endsAt, prizeCents: activeChallenge.prizeCents } : null
        }
      />

      <section id="bonuses" style={{ scrollMarginTop: 20 }}>
        <BonusesPanel rows={bonusReviewRows} />
      </section>
    </div>
  );
}
