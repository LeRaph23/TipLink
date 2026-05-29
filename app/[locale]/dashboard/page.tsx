import { getTranslations, setRequestLocale } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { Link } from '@/i18n/navigation';
import { DigitipCard } from '@/components/dashboard/DigitipCard';
import { StatCard } from '@/components/dashboard/StatCard';

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, [string, string]> = {
    succeeded: ['var(--success-bg)', 'var(--success)'],
    pending:   ['var(--warning-bg)', 'var(--warning)'],
    failed:    ['var(--error-bg)',   'var(--error)'],
  };
  const [bg, color] = map[status] ?? ['var(--neutral-bg)', 'var(--neutral)'];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 8px', borderRadius: 100, fontSize: 11, fontWeight: 600, background: bg, color, whiteSpace: 'nowrap' }}>
      {status !== 'failed' && <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor', flexShrink: 0 }} />}
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const t = await getTranslations('dashboard');

  const [{ data: staffProfile }, { data: roles }] = await Promise.all([
    supabase
      .from('staff_profiles')
      .select('id, full_name, onboarding_status, stripe_account_id')
      .eq('user_id', user!.id)
      .is('deleted_at', null)
      .maybeSingle(),
    supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user!.id),
  ]);

  const isGroupAdmin = roles?.some((r) => r.role === 'group_admin' || r.role === 'super_admin') ?? false;

  const { data: recentTransactions } = await supabase
    .from('transactions')
    .select('id, amount, currency, created_at, status')
    .eq('staff_id', staffProfile?.id ?? '')
    .order('created_at', { ascending: false })
    .limit(5);

  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const fourteenDaysAgoIso = new Date(now - 14 * 24 * 60 * 60 * 1000).toISOString();
  const { data: trendWindow } = await supabase
    .from('transactions')
    .select('amount, created_at, status')
    .eq('staff_id', staffProfile?.id ?? '')
    .eq('status', 'succeeded')
    .gte('created_at', fourteenDaysAgoIso);

  // All-time aggregate. A single SELECT sum() would be cleaner, but
  // staff dashboards only have O(1k) rows so we just fetch amounts.
  const { data: allTimeRows } = await supabase
    .from('transactions')
    .select('amount, currency')
    .eq('staff_id', staffProfile?.id ?? '')
    .eq('status', 'succeeded');
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const thisWeekTxs = trendWindow?.filter((t) => now - new Date(t.created_at).getTime() < weekMs) ?? [];
  const thisWeekTotal = thisWeekTxs.reduce((sum, t) => sum + t.amount, 0);
  const lastWeekTotal = trendWindow?.filter(t => {
    const d = now - new Date(t.created_at).getTime();
    return d >= weekMs && d < 2 * weekMs;
  }).reduce((sum, t) => sum + t.amount, 0) ?? 0;

  const minDataCents = 1000; // 10€
  const trend = lastWeekTotal >= minDataCents
    ? Math.round(((thisWeekTotal - lastWeekTotal) / lastWeekTotal) * 100)
    : undefined;

  const currency = allTimeRows?.[0]?.currency ?? recentTransactions?.[0]?.currency ?? 'EUR';
  const fmt = new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: 2 });
  const totalEarnings = allTimeRows?.reduce((sum, t) => sum + t.amount, 0) ?? 0;

  return (
    <div className="stagger">
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 19, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.03em' }}>
          {t('home.dashboard')}
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 3 }}>
          {t('welcome')} {staffProfile?.full_name ?? (user!.user_metadata?.full_name as string | undefined)?.split(' ')[0] ?? ''}
        </p>
      </div>

      {staffProfile && staffProfile.onboarding_status === 'complete' && (
        <DigitipCard staffId={staffProfile.id} locale={locale} />
      )}

      {/* Group admin without any staff profile yet → invite them to join as staff */}
      {isGroupAdmin && !staffProfile && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 14,
          background: 'linear-gradient(135deg, rgba(229,122,151,0.08), rgba(236,151,176,0.05))',
          border: '1px solid rgba(229,122,151,0.25)',
          borderRadius: 'var(--radius)', padding: '16px 18px', marginBottom: 20,
        }}>
          <div style={{ fontSize: 24, flexShrink: 0 }}>💸</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)', marginBottom: 3 }}>
              {t('home.adminReceiveTipsTitle')}
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--text-3)', lineHeight: 1.5 }}>
              {t('home.adminReceiveTipsBody')}
            </div>
          </div>
          <Link href="/dashboard/banking" style={{
            padding: '9px 16px', borderRadius: 10, border: 'none',
            background: 'var(--accent)', color: '#fff',
            fontSize: 13, fontWeight: 600, textDecoration: 'none',
            whiteSpace: 'nowrap', flexShrink: 0,
          }}>
            {t('home.adminReceiveTipsCta')}
          </Link>
        </div>
      )}

      {/* Staff profile exists but banking not set up */}
      {staffProfile && !staffProfile.stripe_account_id && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 14,
          background: 'linear-gradient(135deg, rgba(229,122,151,0.08), rgba(236,151,176,0.05))',
          border: '1px solid rgba(229,122,151,0.25)',
          borderRadius: 'var(--radius)', padding: '14px 16px', marginBottom: 20,
        }}>
          <div style={{ fontSize: 22, flexShrink: 0 }}>💳</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>
              {isGroupAdmin ? t('home.bankingSetupTitleAdmin') : t('home.bankingSetupTitleStaff')}
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--text-3)' }}>
              {t('home.bankingSetupBody')}
            </div>
          </div>
          <Link href="/dashboard/banking" style={{
            padding: '8px 14px', borderRadius: 10, border: 'none',
            background: 'var(--accent)', color: '#fff',
            fontSize: 12.5, fontWeight: 600, textDecoration: 'none',
            whiteSpace: 'nowrap', flexShrink: 0,
          }}>
            {t('home.bankingSetupCta')}
          </Link>
        </div>
      )}

      <div className="dash-stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 28 }}>
        <StatCard label={t('totalEarned')} value={totalEarnings / 100} format="currency" currency={currency} locale={locale} sub={t('allTime')} />
        <StatCard
          label={t('thisWeek')}
          value={thisWeekTotal / 100}
          format="currency"
          currency={currency}
          locale={locale}
          sub={t('home.last7days')}
          trend={trend}
          trendLabel={t('home.trendVsPrev')}
        />
        <StatCard label={t('transactions')} value={thisWeekTxs.length} format="count" locale={locale} sub={t('home.last7days')} />
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius)' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)' }}>{t('recentTips')}</span>
          <Link href="/dashboard/transactions" style={{ fontSize: 12.5, color: 'var(--text-3)', textDecoration: 'none', padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', fontWeight: 500 }}>
            {t('viewAll')}
          </Link>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                {[t('date'), t('amount'), t('status')].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', borderBottom: '1px solid var(--border)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {!recentTransactions?.length ? (
                <tr><td colSpan={3} style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>{t('noTips')}</td></tr>
              ) : recentTransactions.map(tx => (
                <tr key={tx.id} className="dash-row" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <td style={{ padding: '11px 16px', color: 'var(--text-3)', fontSize: 12.5 }}>
                    {new Date(tx.created_at).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })}
                  </td>
                  <td style={{ padding: '11px 16px', fontWeight: 700, letterSpacing: '-0.02em' }}>
                    {fmt.format(tx.amount / 100)}
                  </td>
                  <td style={{ padding: '11px 16px' }}>
                    <StatusBadge status={tx.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
