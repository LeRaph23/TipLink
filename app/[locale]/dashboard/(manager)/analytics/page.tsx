import { getTranslations, setRequestLocale } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { AnalyticsCharts } from './AnalyticsCharts';

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
  const { data: staffRows } = await supabase
    .from('staff_profiles')
    .select('id, full_name')
    .is('deleted_at', null);

  const staffIds = staffRows?.map((s) => s.id) ?? [];
  const staffNameById = new Map((staffRows ?? []).map((s) => [s.id, s.full_name] as const));

  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: txs } = await supabase
    .from('transactions')
    .select('amount, currency, created_at, staff_id')
    .in('staff_id', staffIds.length ? staffIds : ['00000000-0000-0000-0000-000000000000'])
    .eq('status', 'succeeded')
    .gte('created_at', thirtyDaysAgo)
    .order('created_at', { ascending: true });

  const currency = txs?.[0]?.currency ?? 'EUR';

  // Bucket by day.
  const byDay = new Map<string, number>();
  for (let i = 0; i < 30; i++) {
    const d = new Date(now - (29 - i) * 24 * 60 * 60 * 1000);
    const key = d.toISOString().slice(0, 10);
    byDay.set(key, 0);
  }
  for (const row of txs ?? []) {
    const key = row.created_at.slice(0, 10);
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
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 19, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.03em' }}>{t('title')}</h1>
        <p style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 3 }}>{t('subtitle')}</p>
      </div>

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
