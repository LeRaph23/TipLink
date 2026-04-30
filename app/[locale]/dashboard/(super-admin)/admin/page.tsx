import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { createClient } from '@/lib/supabase/server';

function formatAmount(amountCents: number, currency = 'EUR', locale = 'fr') {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amountCents / 100);
}

function KpiCard({
  label,
  value,
  sub,
  href,
}: {
  label: string;
  value: string;
  sub?: string;
  href?: string;
}) {
  const inner = (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius)',
      padding: 20,
      height: '100%',
      transition: 'border-color 120ms',
    }}>
      <div style={{
        fontSize: 11, fontWeight: 600, color: 'var(--text-3)',
        textTransform: 'uppercase', letterSpacing: '0.07em',
        marginBottom: 10,
      }}>{label}</div>
      <div style={{
        fontSize: 28, fontWeight: 800, color: 'var(--text)',
        letterSpacing: '-0.04em', lineHeight: 1,
      }}>{value}</div>
      {sub && (
        <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 8 }}>{sub}</div>
      )}
    </div>
  );
  return href ? (
    <Link href={href} style={{ textDecoration: 'none' }}>{inner}</Link>
  ) : inner;
}

export default async function AdminOverviewPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('dashboard.admin.overview');
  const supabase = await createClient();

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [
    { data: recentTx },
    { count: groupsCount },
    { count: establishmentsCount },
    { count: staffCount },
    { count: stockCount },
    { count: activeTagsCount },
    { count: pendingOrders },
  ] = await Promise.all([
    supabase
      .from('transactions')
      .select('amount, establishment_id, created_at, status')
      .eq('status', 'succeeded')
      .gte('created_at', thirtyDaysAgo),
    supabase.from('groups').select('id', { count: 'exact', head: true }).is('deleted_at', null),
    supabase.from('establishments').select('id', { count: 'exact', head: true }).is('deleted_at', null),
    supabase.from('staff_profiles').select('id', { count: 'exact', head: true }).is('deleted_at', null).eq('is_active', true),
    supabase.from('nfc_stickers').select('id', { count: 'exact', head: true }).is('establishment_id', null),
    supabase.from('nfc_stickers').select('id', { count: 'exact', head: true }).not('establishment_id', 'is', null),
    supabase.from('smarttag_orders').select('id', { count: 'exact', head: true }).in('status', ['pending_fulfillment', 'encoding']),
  ]);

  const txRows = recentTx ?? [];
  const gmv30d = txRows.reduce((sum, r) => sum + (r.amount ?? 0), 0);
  const txCount30d = txRows.length;

  // Top 5 establishments by GMV 30d.
  const byEstab = new Map<string, number>();
  for (const tx of txRows) {
    if (!tx.establishment_id) continue;
    byEstab.set(tx.establishment_id, (byEstab.get(tx.establishment_id) ?? 0) + (tx.amount ?? 0));
  }
  const topEstabIds = Array.from(byEstab.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const { data: estabDetails } = topEstabIds.length
    ? await supabase
        .from('establishments')
        .select('id, name, group_id, groups(name)')
        .in('id', topEstabIds.map(([id]) => id))
    : { data: [] };

  const estabMap = new Map((estabDetails ?? []).map((e) => [e.id, e]));

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.03em' }}>
          {t('title')}
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 3 }}>{t('subtitle')}</p>
        <div style={{
          marginTop: 14, padding: '12px 14px', borderRadius: 'var(--radius-sm)',
          background: 'var(--accent-muted)', border: '1px solid var(--border)',
          fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.55,
        }}>
          {t('purposeCallout')}
        </div>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
        gap: 12, marginBottom: 28,
      }}>
        <KpiCard
          label={t('gmv30d')}
          value={formatAmount(gmv30d, 'EUR', locale)}
          sub={t('gmvSub', { count: txCount30d })}
          href="/dashboard/admin/transactions"
        />
        <KpiCard label={t('groups')} value={String(groupsCount ?? 0)} href="/dashboard/admin/groups" />
        <KpiCard label={t('establishments')} value={String(establishmentsCount ?? 0)} href="/dashboard/admin/establishments" />
        <KpiCard label={t('activeStaff')} value={String(staffCount ?? 0)} />
        <KpiCard label={t('tagStock')} value={String(stockCount ?? 0)} href="/dashboard/admin/smarttags" sub={t('tagStockSub')} />
        <KpiCard label={t('tagsActive')} value={String(activeTagsCount ?? 0)} href="/dashboard/admin/smarttags" />
        <KpiCard label={t('pendingOrders')} value={String(pendingOrders ?? 0)} href="/dashboard/admin/orders" sub={t('pendingOrdersSub')} />
      </div>

      <section>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>
          {t('topEstablishments')}
        </h2>
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius)',
          overflow: 'hidden',
        }}>
          {topEstabIds.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
              {t('topEmpty')}
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  {[t('colRank'), t('colName'), t('colGroup'), t('colVolume')].map((h, i) => (
                    <th key={i} style={{
                      padding: '10px 16px', textAlign: i === 3 ? 'right' : 'left',
                      fontSize: 11, fontWeight: 600, color: 'var(--text-3)',
                      textTransform: 'uppercase', letterSpacing: '0.07em',
                      borderBottom: '1px solid var(--border)',
                      background: 'var(--surface-2)',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {topEstabIds.map(([id, vol], i) => {
                  const est = estabMap.get(id);
                  const groupName = (est?.groups as { name: string } | null)?.name ?? '—';
                  return (
                    <tr key={id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <td style={{ padding: '11px 16px', color: 'var(--text-3)', width: 40 }}>#{i + 1}</td>
                      <td style={{ padding: '11px 16px', color: 'var(--text)', fontWeight: 500 }}>{est?.name ?? '—'}</td>
                      <td style={{ padding: '11px 16px', color: 'var(--text-2)' }}>{groupName}</td>
                      <td style={{ padding: '11px 16px', color: 'var(--text)', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                        {formatAmount(vol, 'EUR', locale)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}
