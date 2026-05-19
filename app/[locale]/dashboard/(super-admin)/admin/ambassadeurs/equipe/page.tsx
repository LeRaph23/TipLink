import { setRequestLocale } from 'next-intl/server';
import { requireSuperAdmin } from '@/lib/auth/require-super-admin';
import { createServiceClient } from '@/lib/supabase/service';
import { RosterManager, type RosterAmbassador } from './RosterManager';
import { getWeekBounds, getWeeklyTier } from '@/lib/ambassador-tiers';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function AmbassadeursEquipePage({
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
    .select('id, name, is_active, payouts_frozen, created_at, referrer_ambassador_id, promo_codes(id, code, percentage_off)')
    .order('created_at', { ascending: false });

  const { data: salesRows } = await service
    .from('ambassador_sales')
    .select('ambassador_id, commission_amount, created_at')
    .is('voided_at', null);

  const { start: weekStart, end: weekEnd } = getWeekBounds(new Date());

  const salesByAmb: Record<string, { count: number; commission: number; week: number }> = {};
  for (const s of salesRows ?? []) {
    const agg = (salesByAmb[s.ambassador_id] ??= { count: 0, commission: 0, week: 0 });
    agg.count += 1;
    agg.commission += s.commission_amount;
    const d = new Date(s.created_at);
    if (d >= weekStart && d <= weekEnd) agg.week += 1;
  }

  const roster: RosterAmbassador[] = (ambassadors ?? []).map((a) => {
    const pc = a.promo_codes as { id: string; code: string; percentage_off: number } | null;
    const agg = salesByAmb[a.id] ?? { count: 0, commission: 0, week: 0 };
    const tier = getWeeklyTier(agg.week);
    return {
      id: a.id,
      name: a.name,
      is_active: a.is_active,
      payouts_frozen: a.payouts_frozen,
      created_at: a.created_at,
      promoCodeId: pc?.id ?? '',
      promoCode: pc?.code ?? '',
      percentageOff: pc?.percentage_off ?? 0,
      salesCount: agg.count,
      totalCommission: agg.commission,
      weekCount: agg.week,
      weeklyTier: tier ? { label: tier.label, emoji: tier.emoji } : null,
      referrerAmbassadorId: a.referrer_ambassador_id ?? null,
    };
  });

  // Active promo codes not yet linked to any ambassador — for the create form.
  const linkedPromoCodeIds = (ambassadors ?? [])
    .map((a) => (a.promo_codes as { id: string } | null)?.id)
    .filter(Boolean) as string[];

  const promoQuery = service
    .from('promo_codes')
    .select('id, code, percentage_off')
    .eq('is_active', true)
    .order('code');

  const { data: allPromoCodes } = linkedPromoCodeIds.length > 0
    ? await promoQuery.not('id', 'in', `(${linkedPromoCodeIds.join(',')})`)
    : await promoQuery;

  const referrerOptions = (ambassadors ?? []).map((a) => ({ id: a.id, name: a.name }));

  return (
    <RosterManager
      ambassadors={roster}
      availablePromoCodes={allPromoCodes ?? []}
      referrerOptions={referrerOptions}
    />
  );
}
