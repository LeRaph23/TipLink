import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { requireSuperAdmin } from '@/lib/auth/require-super-admin';
import { createServiceClient } from '@/lib/supabase/service';
import { AmbassadeurDetail, type FicheData } from './AmbassadeurDetail';
import {
  getWeekBounds,
  getWeeklyTier,
  computeTotalBaseCommission,
} from '@/lib/ambassador-tiers';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function AmbassadeurFichePage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  await requireSuperAdmin(locale);

  const service = createServiceClient();

  const { data: amb } = await service
    .from('ambassadors')
    .select('id, name, is_active, payouts_frozen, created_at, email, siret, stripe_account_id, pin_hash, referral_code, referrer_ambassador_id, promo_codes(code, percentage_off)')
    .eq('id', id)
    .maybeSingle();

  if (!amb) notFound();

  const [
    { data: salesRaw },
    { data: payoutsRaw },
    { data: bonusCreditsRaw },
    { data: referralRewardsRaw },
    { data: filleulsRaw },
    { data: claimsRaw },
    { data: visitsRaw },
    { data: contractsRaw },
    { data: emailsRaw },
  ] = await Promise.all([
    service.from('ambassador_sales')
      .select('id, pack, commission_amount, created_at, voided_at, salon_name_partial')
      .eq('ambassador_id', id)
      .order('created_at', { ascending: false }),
    service.from('ambassador_payouts')
      .select('id, amount_cents, status, requested_at, paid_at, failure_reason, stripe_transfer_id')
      .eq('ambassador_id', id)
      .order('requested_at', { ascending: false }),
    service.from('ambassador_bonus_credits')
      .select('kind, period_key, amount_cents, credited_at')
      .eq('ambassador_id', id),
    service.from('referral_payouts')
      .select('id, reason, amount_cents, status, created_at, credited_at')
      .eq('referrer_ambassador_id', id),
    service.from('ambassadors')
      .select('id, name, referral_validated_at')
      .eq('referrer_ambassador_id', id),
    service.from('ambassador_zone_claims')
      .select('id, claimed_at, released_at, salon_zones(id, name, city, is_active)')
      .eq('ambassador_id', id)
      .order('claimed_at', { ascending: false }),
    service.from('salon_visits')
      .select('id, visited_at, flyer_left, convinced, likelihood_rating, notes, follow_up_at, location_verified, distance_m, salons(name, city)')
      .eq('ambassador_id', id)
      .order('visited_at', { ascending: false }),
    service.from('ambassador_contracts')
      .select('id, title, status, sent_at, viewed_at, signed_at')
      .eq('ambassador_id', id)
      .order('sent_at', { ascending: false }),
    service.from('ambassador_email_logs')
      .select('id, subject, status, sent_at, template_slug')
      .eq('ambassador_id', id)
      .order('sent_at', { ascending: false })
      .limit(30),
  ]);

  // Sale counts: validated filleul list needs each filleul's live (non-voided)
  // sale count for the referral validation rule.
  const filleulIds = (filleulsRaw ?? []).map((f) => f.id);
  const filleulSaleCount: Record<string, number> = {};
  if (filleulIds.length > 0) {
    const { data: fSales } = await service
      .from('ambassador_sales')
      .select('ambassador_id')
      .in('ambassador_id', filleulIds)
      .is('voided_at', null);
    for (const s of fSales ?? []) {
      filleulSaleCount[s.ambassador_id] = (filleulSaleCount[s.ambassador_id] ?? 0) + 1;
    }
  }

  let parrain: { id: string; name: string } | null = null;
  if (amb.referrer_ambassador_id) {
    const { data: p } = await service
      .from('ambassadors')
      .select('id, name')
      .eq('id', amb.referrer_ambassador_id)
      .maybeSingle();
    if (p) parrain = { id: p.id, name: p.name };
  }

  const sales = salesRaw ?? [];
  const liveSales = sales.filter((s) => !s.voided_at);

  // Base commission from non-voided sales.
  const commissionBase = computeTotalBaseCommission(
    liveSales.map((s) => ({ commission_amount: s.commission_amount, created_at: s.created_at }))
  );
  const creditedBonus = (bonusCreditsRaw ?? []).reduce((s, c) => s + c.amount_cents, 0);
  const creditedReferral = (referralRewardsRaw ?? [])
    .filter((r) => r.status === 'credited')
    .reduce((s, r) => s + r.amount_cents, 0);

  const paidOrPending = (payoutsRaw ?? [])
    .filter((p) => p.status === 'pending' || p.status === 'paid' || (p.status === 'failed' && p.stripe_transfer_id))
    .reduce((s, p) => s + p.amount_cents, 0);

  const earned = commissionBase + creditedBonus + creditedReferral;

  const now = new Date();
  const { start: weekStart, end: weekEnd } = getWeekBounds(now);
  const weekCount = liveSales.filter((s) => {
    const d = new Date(s.created_at);
    return d >= weekStart && d <= weekEnd;
  }).length;
  const tier = getWeeklyTier(weekCount);

  // 10-week sales trend.
  const WEEKS = 10;
  const weekBuckets = Array.from({ length: WEEKS }, (_, i) => {
    const start = new Date(weekStart.getTime() - (WEEKS - 1 - i) * 7 * 86400000);
    return { start, end: new Date(start.getTime() + 7 * 86400000), count: 0 };
  });
  for (const s of liveSales) {
    const d = new Date(s.created_at);
    for (const b of weekBuckets) {
      if (d >= b.start && d < b.end) { b.count += 1; break; }
    }
  }

  const promo = amb.promo_codes as { code: string; percentage_off: number } | null;

  const data: FicheData = {
    id: amb.id,
    name: amb.name,
    isActive: amb.is_active,
    payoutsFrozen: amb.payouts_frozen,
    createdAt: amb.created_at,
    email: amb.email ?? null,
    siret: amb.siret ?? null,
    hasStripe: !!amb.stripe_account_id,
    pinSet: !!amb.pin_hash,
    promoCode: promo?.code ?? '',
    percentageOff: promo?.percentage_off ?? 0,
    referralCode: amb.referral_code ?? null,
    parrain,
    kpis: {
      salesTotal: liveSales.length,
      voidedCount: sales.length - liveSales.length,
      commissionBase,
      creditedBonus,
      creditedReferral,
      earned,
      paidOrPending,
      available: Math.max(0, earned - paidOrPending),
      weekCount,
      weeklyTier: tier ? { label: tier.label, emoji: tier.emoji } : null,
    },
    weekly: weekBuckets.map((b) => ({
      label: b.start.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }),
      ventes: b.count,
      commission: 0,
    })),
    sales: sales.map((s) => ({
      id: s.id,
      pack: s.pack,
      commissionCents: s.commission_amount,
      createdAt: s.created_at,
      voided: !!s.voided_at,
      salon: s.salon_name_partial ?? null,
    })),
    payouts: (payoutsRaw ?? []).map((p) => ({
      id: p.id,
      amountCents: p.amount_cents,
      status: p.status,
      requestedAt: p.requested_at,
      paidAt: p.paid_at,
      failureReason: p.failure_reason,
    })),
    bonusCredits: (bonusCreditsRaw ?? []).map((c) => ({
      kind: c.kind,
      periodKey: c.period_key,
      amountCents: c.amount_cents,
      createdAt: c.credited_at,
    })),
    zones: (claimsRaw ?? []).map((c) => {
      const z = c.salon_zones as { id: string; name: string; city: string; is_active: boolean } | null;
      return {
        id: c.id,
        zoneName: z?.name ?? '—',
        city: z?.city ?? '—',
        claimedAt: c.claimed_at,
        releasedAt: c.released_at,
        active: !!z?.is_active,
      };
    }),
    visits: (visitsRaw ?? []).map((v) => {
      const s = v.salons as { name: string; city: string } | null;
      return {
        id: v.id,
        salonName: s?.name ?? '—',
        salonCity: s?.city ?? '—',
        visitedAt: v.visited_at,
        flyerLeft: v.flyer_left,
        convinced: v.convinced as 'yes' | 'maybe' | 'no',
        rating: v.likelihood_rating,
        notes: v.notes,
        followUpAt: v.follow_up_at,
        locationVerified: v.location_verified,
        distanceM: v.distance_m == null ? null : Number(v.distance_m),
      };
    }),
    filleuls: (filleulsRaw ?? []).map((f) => ({
      id: f.id,
      name: f.name,
      salesCount: filleulSaleCount[f.id] ?? 0,
      validated: !!f.referral_validated_at,
    })),
    referralRewards: (referralRewardsRaw ?? []).map((r) => ({
      id: r.id,
      reason: r.reason,
      amountCents: r.amount_cents,
      status: r.status,
      createdAt: r.created_at,
      creditedAt: r.credited_at,
    })),
    contracts: (contractsRaw ?? []).map((c) => ({
      id: c.id,
      title: c.title,
      status: c.status,
      sentAt: c.sent_at,
      signedAt: c.signed_at,
    })),
    emails: (emailsRaw ?? []).map((e) => ({
      id: e.id,
      subject: e.subject,
      status: e.status,
      sentAt: e.sent_at,
      templateSlug: e.template_slug,
    })),
  };

  return <AmbassadeurDetail data={data} />;
}
