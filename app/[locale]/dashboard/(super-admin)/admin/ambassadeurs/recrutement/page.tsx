import { setRequestLocale } from 'next-intl/server';
import { requireSuperAdmin } from '@/lib/auth/require-super-admin';
import { createServiceClient } from '@/lib/supabase/service';
import { RecruitmentApplications, type RecruitmentApplicationRow } from '../RecruitmentApplications';
import { ReferralsPanel, type ReferralFilleulRow, type ReferralMilestoneRow } from '../ReferralsPanel';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function AmbassadeursRecrutementPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireSuperAdmin(locale);

  const service = createServiceClient();

  const [
    { data: ambassadors },
    { data: salesRows },
    { data: referralPayouts },
    { data: recruitmentRaw },
  ] = await Promise.all([
    service
      .from('ambassadors')
      .select('id, name, referrer_ambassador_id, referral_validated_at')
      .order('created_at', { ascending: false }),
    service.from('ambassador_sales').select('ambassador_id').is('voided_at', null),
    service
      .from('referral_payouts')
      .select('id, referrer_ambassador_id, referred_ambassador_id, amount_cents, reason, status, credited_at'),
    service
      .from('ambassador_recruitment_applications')
      .select('id, first_name, last_name, city, phone, email, siret, no_fraud_pledge, notes, status, reviewed_at, created_at, referrer_ambassador_id, referrer_code_used')
      .order('created_at', { ascending: false }),
  ]);

  const nameById = new Map((ambassadors ?? []).map((a) => [a.id, a.name]));
  const allReferralPayouts = referralPayouts ?? [];

  const salesCountByAmb: Record<string, number> = {};
  for (const s of salesRows ?? []) {
    salesCountByAmb[s.ambassador_id] = (salesCountByAmb[s.ambassador_id] ?? 0) + 1;
  }

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
        liveSales: salesCountByAmb[a.id] ?? 0,
        validated: !!a.referral_validated_at,
        payoutId: payout?.id ?? null,
        payoutStatus: (payout?.status as 'pending' | 'credited' | 'voided' | undefined) ?? null,
        payoutAmountCents: payout?.amount_cents ?? 2500,
        creditedAt: payout?.credited_at ?? null,
      };
    })
    .sort((x, y) => Number(!!y.payoutId) - Number(!!x.payoutId) || y.liveSales - x.liveSales);

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
    referrerName: r.referrer_ambassador_id
      ? (nameById.get(r.referrer_ambassador_id) ?? r.referrer_code_used ?? null)
      : (r.referrer_code_used ?? null),
  }));

  return (
    <div>
      <RecruitmentApplications applications={recruitmentApplications} />
      <ReferralsPanel filleuls={referralFilleuls} milestones={referralMilestones} />
    </div>
  );
}
