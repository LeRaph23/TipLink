import { getTranslations, setRequestLocale } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { AnalyticsCharts } from './AnalyticsCharts';
import { PageHeader } from '@/components/dashboard/ui';

export default async function AnalyticsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('dashboard.analytics');

  const supabase = await createClient();
  await supabase.auth.getUser();

  // Find staff ids this user manages (through group/establishment via RLS).
  // Capped to keep the page responsive on large tenants.
  const STAFF_LIMIT = 5000;
  const TX_LIMIT = 50_000;
  const { data: staffRows } = await supabase
    .from('staff_profiles')
    .select('id, full_name')
    .is('deleted_at', null)
    .limit(STAFF_LIMIT);

  const staffIds = staffRows?.map((s) => s.id) ?? [];
  const staffNameById = new Map((staffRows ?? []).map((s) => [s.id, s.full_name] as const));

  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();

  // Read the per-employee allocations, not the transactions.
  //
  // `transactions.amount` is what the customer paid, which since the 00073 fee
  // model is the tip PLUS the service fee added on top. Charting it showed the
  // manager a number the salon never receives, ~25 c + 5 % per tip above the
  // bank. And a group tip has `staff_id: null`, so filtering transactions by
  // staff id dropped them entirely: a restaurant using only the team tag saw a
  // chart flat at zero while money was coming in daily.
  const { data: txs } = await supabase
    .from('tip_allocations')
    .select('amount, allocated_at, staff_id, transactions(currency)')
    .in('staff_id', staffIds.length ? staffIds : ['00000000-0000-0000-0000-000000000000'])
    .eq('status', 'allocated')
    .gte('allocated_at', thirtyDaysAgo)
    .order('allocated_at', { ascending: true })
    .limit(TX_LIMIT);

  const currency =
    (txs?.[0]?.transactions as { currency?: string } | null)?.currency ?? 'EUR';

  // Bucket by day.
  const byDay = new Map<string, number>();
  for (let i = 0; i < 30; i++) {
    const d = new Date(now - (29 - i) * 24 * 60 * 60 * 1000);
    const key = d.toISOString().slice(0, 10);
    byDay.set(key, 0);
  }
  for (const row of txs ?? []) {
    if (!row.allocated_at) continue;
    const key = row.allocated_at.slice(0, 10);
    byDay.set(key, (byDay.get(key) ?? 0) + row.amount);
  }
  const dailySeries = Array.from(byDay.entries()).map(([date, amount]) => ({
    date,
    total: amount / 100,
  }));

  // Top 5 staff.
  const byStaff = new Map<string, number>();
  for (const row of txs ?? []) {
    if (!row.staff_id) continue;
    byStaff.set(row.staff_id, (byStaff.get(row.staff_id) ?? 0) + row.amount);
  }
  const topStaff = Array.from(byStaff.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, amount]) => ({
      name: staffNameById.get(id) ?? '—',
      total: amount / 100,
    }));

  return (
    <div>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />

      <AnalyticsCharts
        daily={dailySeries}
        topStaff={topStaff}
        currency={currency}
        locale={locale}
        labels={{
          revenue: t('revenue'),
          topStaff: t('topStaff'),
          noData: t('noData'),
          date: t('date'),
          amount: t('amount'),
        }}
      />
    </div>
  );
}
