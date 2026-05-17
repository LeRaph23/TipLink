import { setRequestLocale } from 'next-intl/server';
import { requireSuperAdmin } from '@/lib/auth/require-super-admin';
import { createServiceClient } from '@/lib/supabase/service';
import { AmbassadeursManager } from './AmbassadeursManager';
import { AmbassadeursOverview, type AmbassadorOverviewRow, type PendingPayoutRow } from './AmbassadeursOverview';
import { RecruitmentApplications, type RecruitmentApplicationRow } from './RecruitmentApplications';
import { ReferralsPanel, type ReferralFilleulRow, type ReferralMilestoneRow } from './ReferralsPanel';
import { BonusesPanel, type BonusReviewRow } from './BonusesPanel';
import {
  getWeekBounds,
  getMonthBounds,
  getWeeklyTier,
  computeTotalBaseCommission,
  computeClosedWeekBonusBreakdown,
  computeClosedMonthlyBonuses,
} from '@/lib/ambassador-tiers';

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius)', padding: 14,
    }}>
      <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>{value}</div>
    </div>
  );
}

export default async function AdminAmbassadeursPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireSuperAdmin(locale);

  const service = createServiceClient();

  // Fetch ambassadors with their promo code info + banking fields
  const { data: ambassadors } = await service
    .from('ambassadors')
    .select('id, name, is_active, payouts_frozen, created_at, stripe_account_id, siret, referrer_ambassador_id, referral_validated_at, promo_codes(id, code, percentage_off)')
    .order('created_at', { ascending: false });

  // Aggregate sales per ambassador (full rows needed for week/month/bonus
  // computation). Voided sales — refunded / charged-back / canceled orders —
  // are excluded so commissions, bonuses and the leaderboard reflect only
  // revenue the platform actually kept.
  const { data: salesRows } = await service
    .from('ambassador_sales')
    .select('ambassador_id, commission_amount, created_at')
    .is('voided_at', null);

  const { data: payoutsRowsRaw } = await service
    .from('ambassador_payouts')
    .select('id, ambassador_id, amount_cents, status, stripe_transfer_id, requested_at')
    .in('status', ['pending', 'paid', 'failed']);

  // A `failed` payout only counts as money-out when its Stripe transfer leg
  // already went through (mirrors computeAvailableCents in the payout route).
  const payoutsRows = (payoutsRowsRaw ?? []).filter(
    (p) =>
      p.status === 'pending' ||
      p.status === 'paid' ||
      (p.status === 'failed' && p.stripe_transfer_id)
  );

  // Referral rewards (validation + milestones) across all ambassadors.
  const { data: referralPayouts } = await service
    .from('referral_payouts')
    .select('id, referrer_ambassador_id, referred_ambassador_id, amount_cents, reason, status, credited_at, created_at');

  const now = new Date();
  const { start: weekStart, end: weekEnd } = getWeekBounds(now);
  const { start: monthStart, end: monthEnd } = getMonthBounds(now);

  const weekCountByAmb: Record<string, number> = {};
  const monthCountByAmb: Record<string, number> = {};
  const salesByAmb: Record<string, Array<{ commission_amount: number; created_at: string }>> = {};
  for (const s of salesRows ?? []) {
    if (!salesByAmb[s.ambassador_id]) salesByAmb[s.ambassador_id] = [];
    salesByAmb[s.ambassador_id].push({ commission_amount: s.commission_amount, created_at: s.created_at });
    const d = new Date(s.created_at);
    if (d >= weekStart && d <= weekEnd) {
      weekCountByAmb[s.ambassador_id] = (weekCountByAmb[s.ambassador_id] ?? 0) + 1;
    }
    if (d >= monthStart && d <= monthEnd) {
      monthCountByAmb[s.ambassador_id] = (monthCountByAmb[s.ambassador_id] ?? 0) + 1;
    }
  }

  const paidOrPendingByAmb: Record<string, number> = {};
  for (const p of payoutsRows ?? []) {
    paidOrPendingByAmb[p.ambassador_id] = (paidOrPendingByAmb[p.ambassador_id] ?? 0) + p.amount_cents;
  }

  const salesByAmbassador: Record<string, { count: number; totalCommission: number }> = {};
  for (const s of salesRows ?? []) {
    if (!salesByAmbassador[s.ambassador_id]) {
      salesByAmbassador[s.ambassador_id] = { count: 0, totalCommission: 0 };
    }
    salesByAmbassador[s.ambassador_id].count += 1;
    salesByAmbassador[s.ambassador_id].totalCommission += s.commission_amount;
  }

  // ─── Referral program data ─────────────────────────────────────────────────
  const nameById = new Map((ambassadors ?? []).map((a) => [a.id, a.name]));
  const allReferralPayouts = referralPayouts ?? [];

  // Credited referral rewards add to the parrain's withdrawable balance.
  const creditedReferralByReferrer: Record<string, number> = {};
  for (const p of allReferralPayouts) {
    if (p.status === 'credited') {
      creditedReferralByReferrer[p.referrer_ambassador_id] =
        (creditedReferralByReferrer[p.referrer_ambassador_id] ?? 0) + p.amount_cents;
    }
  }

  // One row per filleul (every ambassador created with a parrain), showing the
  // filleul's live sale count and the state of the 25€ validation reward.
  const referralFilleuls: ReferralFilleulRow[] = (ambassadors ?? [])
    .filter((a) => a.referrer_ambassador_id)
    .map((a) => {
      const payout = allReferralPayouts.find(
        (p) =>
          p.reason === 'validation' &&
          p.referred_ambassador_id === a.id &&
          p.referrer_ambassador_id === a.referrer_ambassador_id
      );
      return {
        filleulId: a.id,
        filleulName: a.name,
        parrainName: nameById.get(a.referrer_ambassador_id!) ?? '—',
        liveSales: salesByAmbassador[a.id]?.count ?? 0,
        validated: !!a.referral_validated_at,
        payoutId: payout?.id ?? null,
        payoutStatus: (payout?.status as 'pending' | 'credited' | 'voided' | undefined) ?? null,
        payoutAmountCents: payout?.amount_cents ?? 2500,
        creditedAt: payout?.credited_at ?? null,
      };
    })
    .sort((x, y) => Number(!!y.payoutId) - Number(!!x.payoutId) || y.liveSales - x.liveSales);

  // One row per milestone reward (5 / 10 validated filleuls).
  const referralMilestones: ReferralMilestoneRow[] = allReferralPayouts
    .filter((p) => p.reason === 'milestone_5' || p.reason === 'milestone_10')
    .map((p) => ({
      payoutId: p.id,
      parrainName: nameById.get(p.referrer_ambassador_id) ?? '—',
      reason: p.reason as 'milestone_5' | 'milestone_10',
      amountCents: p.amount_cents,
      payoutStatus: p.status as 'pending' | 'credited' | 'voided',
      creditedAt: p.credited_at,
    }))
    .sort((x, y) => x.parrainName.localeCompare(y.parrainName));

  // Slim list for the "parrain" picker in the create-ambassador form.
  const referrerOptions = (ambassadors ?? []).map((a) => ({ id: a.id, name: a.name }));

  // ─── Bonuses to review ─────────────────────────────────────────────────────
  // Every bonus is paid manually. We list each bonus earned from current
  // (non-voided) sales and flag which ones a super-admin has already credited.
  const { data: bonusCreditRows } = await service
    .from('ambassador_bonus_credits')
    .select('ambassador_id, kind, period_key, amount_cents');

  const creditedBonusKeys = new Set(
    (bonusCreditRows ?? []).map((c) => `${c.ambassador_id}|${c.kind}|${c.period_key}`)
  );
  const creditedBonusByAmb: Record<string, number> = {};
  for (const c of bonusCreditRows ?? []) {
    creditedBonusByAmb[c.ambassador_id] = (creditedBonusByAmb[c.ambassador_id] ?? 0) + c.amount_cents;
  }

  const fmtDay = (iso: string) =>
    new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long' });
  const fmtMonth = (periodKey: string) => {
    const [y, m] = periodKey.split('-').map(Number);
    return new Date(y, (m ?? 1) - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  };

  const bonusReviewRows: BonusReviewRow[] = [];
  for (const a of ambassadors ?? []) {
    for (const w of computeClosedWeekBonusBreakdown(salesByAmb[a.id] ?? [], now)) {
      bonusReviewRows.push({
        key: `${a.id}|weekly_tier|${w.periodKey}`,
        ambassadorId: a.id,
        ambassadorName: a.name,
        kind: 'weekly_tier',
        periodKey: w.periodKey,
        label: `Palier ${w.tierLabel} — semaine du ${fmtDay(w.weekStartIso)}`,
        detail: `${w.count} ventes`,
        amountCents: w.bonusCents,
        credited: creditedBonusKeys.has(`${a.id}|weekly_tier|${w.periodKey}`),
      });
    }
  }
  for (const m of computeClosedMonthlyBonuses(salesRows ?? [], now)) {
    bonusReviewRows.push({
      key: `${m.ambassadorId}|monthly_challenge|${m.periodKey}`,
      ambassadorId: m.ambassadorId,
      ambassadorName: nameById.get(m.ambassadorId) ?? '—',
      kind: 'monthly_challenge',
      periodKey: m.periodKey,
      label: `Défi mensuel — ${fmtMonth(m.periodKey)}`,
      detail: `${m.count} ventes · #1`,
      amountCents: m.bonusCents,
      credited: creditedBonusKeys.has(`${m.ambassadorId}|monthly_challenge|${m.periodKey}`),
    });
  }
  // "À vérifier" first, then most recent period first.
  bonusReviewRows.sort(
    (x, y) => Number(x.credited) - Number(y.credited) || y.periodKey.localeCompare(x.periodKey)
  );

  // Fetch active promo codes not yet linked to an ambassador (for the create form)
  const linkedPromoCodeIds = (ambassadors ?? [])
    .map((a) => {
      const pc = a.promo_codes as { id: string } | null;
      return pc?.id;
    })
    .filter(Boolean) as string[];

  const promoQuery = service
    .from('promo_codes')
    .select('id, code, percentage_off')
    .eq('is_active', true)
    .order('code');

  const { data: allPromoCodes } = linkedPromoCodeIds.length > 0
    ? await promoQuery.not('id', 'in', `(${linkedPromoCodeIds.join(',')})`)
    : await promoQuery;

  const totalSales = (salesRows ?? []).length;
  const totalCommission = (salesRows ?? []).reduce((s, r) => s + r.commission_amount, 0);
  const activeCount = (ambassadors ?? []).filter(a => a.is_active).length;

  const ambassadorsWithStats = (ambassadors ?? []).map((a) => {
    const pc = a.promo_codes as { id: string; code: string; percentage_off: number } | null;
    const stats = salesByAmbassador[a.id] ?? { count: 0, totalCommission: 0 };
    return {
      id: a.id,
      name: a.name,
      is_active: a.is_active,
      payouts_frozen: a.payouts_frozen,
      created_at: a.created_at,
      promoCodeId: pc?.id ?? '',
      promoCode: pc?.code ?? '',
      percentageOff: pc?.percentage_off ?? 0,
      salesCount: stats.count,
      totalCommission: stats.totalCommission,
      referrerAmbassadorId: a.referrer_ambassador_id ?? null,
    };
  });

  // Overview rows
  const overviewRows: AmbassadorOverviewRow[] = (ambassadors ?? []).map((a) => {
    const allSales = salesByAmb[a.id] ?? [];
    const wkCount = weekCountByAmb[a.id] ?? 0;
    const mthCount = monthCountByAmb[a.id] ?? 0;
    const tier = getWeeklyTier(wkCount);
    const base = computeTotalBaseCommission(allSales);
    // Bonuses (weekly + monthly) and referral rewards count only once a
    // super-admin has credited them — nothing is automatic.
    const earned =
      base + (creditedBonusByAmb[a.id] ?? 0) + (creditedReferralByReferrer[a.id] ?? 0);
    const paid = paidOrPendingByAmb[a.id] ?? 0;
    return {
      id: a.id,
      name: a.name,
      weekCount: wkCount,
      monthCount: mthCount,
      weeklyTier: tier ? { label: tier.label, emoji: tier.emoji, bonus: tier.bonus } : null,
      earnedTotalCents: earned,
      paidOrPendingCents: paid,
      availableCents: Math.max(0, earned - paid),
      hasStripeAccount: !!a.stripe_account_id,
      siret: a.siret ?? null,
    };
  });

  const monthLeaderboard = Object.entries(monthCountByAmb)
    .map(([id, count]) => {
      const amb = (ambassadors ?? []).find((x) => x.id === id);
      return { id, name: amb?.name ?? '—', count };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Recruitment applications
  const { data: recruitmentRaw } = await service
    .from('ambassador_recruitment_applications')
    .select('id, first_name, last_name, city, phone, email, siret, no_fraud_pledge, notes, status, reviewed_at, created_at, referrer_ambassador_id, referrer_code_used')
    .order('created_at', { ascending: false });

  const recruitmentApplications: RecruitmentApplicationRow[] = (recruitmentRaw ?? []).map((r) => ({
    id: r.id,
    first_name: r.first_name,
    last_name: r.last_name,
    city: r.city,
    phone: r.phone,
    email: r.email,
    siret: r.siret,
    no_fraud_pledge: r.no_fraud_pledge,
    notes: r.notes,
    status: r.status as 'pending' | 'accepted' | 'rejected',
    reviewed_at: r.reviewed_at,
    created_at: r.created_at,
    // Who recruited this candidate, so the admin knows which parrain to pick
    // when creating the ambassador account.
    referrerName: r.referrer_ambassador_id
      ? (nameById.get(r.referrer_ambassador_id) ?? r.referrer_code_used ?? null)
      : (r.referrer_code_used ?? null),
  }));

  // Pending payouts list (with ambassador name)
  const { data: pendingRowsRaw } = await service
    .from('ambassador_payouts')
    .select('id, ambassador_id, amount_cents, status, requested_at')
    .eq('status', 'pending')
    .order('requested_at', { ascending: true });

  const pendingPayouts: PendingPayoutRow[] = (pendingRowsRaw ?? []).map((p) => {
    const amb = (ambassadors ?? []).find((x) => x.id === p.ambassador_id);
    return {
      id: p.id,
      ambassador_id: p.ambassador_id,
      ambassador_name: amb?.name ?? '—',
      amount_cents: p.amount_cents,
      status: p.status,
      requested_at: p.requested_at,
    };
  });

  return (
    <div>
      <div style={{ marginBottom: 22, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.03em' }}>
            Ambassadeurs
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 3 }}>
            Gérez les étudiants apporteurs d&apos;affaires et leurs commissions.
          </p>
        </div>
        <a
          href={`/${locale}/dashboard/admin/ambassadeurs/communications`}
          style={{
            padding: '9px 16px', borderRadius: 8,
            background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 600,
            textDecoration: 'none', whiteSpace: 'nowrap',
          }}
        >
          Communications →
        </a>
      </div>

      <div className="dash-kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 28 }}>
        <StatCard label="Ambassadeurs actifs" value={String(activeCount)} />
        <StatCard label="Ventes totales" value={String(totalSales)} />
        <StatCard label="Commissions dues" value={`${(totalCommission / 100).toFixed(0)} €`} />
      </div>

      <RecruitmentApplications applications={recruitmentApplications} />

      <AmbassadeursOverview
        rows={overviewRows}
        monthLeaderboard={monthLeaderboard}
        pendingPayouts={pendingPayouts}
      />

      <BonusesPanel rows={bonusReviewRows} />

      <ReferralsPanel
        filleuls={referralFilleuls}
        milestones={referralMilestones}
      />

      <AmbassadeursManager
        ambassadors={ambassadorsWithStats}
        availablePromoCodes={allPromoCodes ?? []}
        referrerOptions={referrerOptions}
      />
    </div>
  );
}
