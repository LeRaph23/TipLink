import { getTranslations, setRequestLocale } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { hasPro } from '@/lib/billing/entitlements';
import { getReviewTeaser } from '@/lib/billing/review-teaser';
import { ProUpsell } from '@/components/billing/ProUpsell';
import { Link } from '@/i18n/navigation';
import { DigitipCard } from '@/components/dashboard/DigitipCard';
import { StatCard } from '@/components/dashboard/StatCard';

// Line-style card icon for the banking prompts, matching the dashboard set.
function CardIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="4" width="14" height="9" rx="1.5" /><path d="M1 7h14" /><path d="M3.5 10.5h2.5" />
    </svg>
  );
}

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
      .select('role, group_id')
      .eq('user_id', user!.id),
  ]);

  const isGroupAdmin = roles?.some((r) => r.role === 'group_admin' || r.role === 'super_admin') ?? false;

  // The Pro teaser is a group-admin concern: nobody else can act on it, and
  // showing an employee an upsell for their manager's subscription is noise.
  const adminGroupId =
    roles?.find((r) => (r.role === 'group_admin' || r.role === 'super_admin') && r.group_id)?.group_id ?? null;

  const reviewTeaser = adminGroupId
    ? await (async () => {
        const service = createServiceClient();
        // Skipped outright for Pro groups — they already have the feature.
        if (await hasPro(service, adminGroupId)) return null;
        return getReviewTeaser(service, adminGroupId);
      })()
    : null;

  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const fourteenDaysAgoIso = new Date(now - 14 * 24 * 60 * 60 * 1000).toISOString();

  // All tip queries below filter on the staff profile id. Without a profile
  // there are no tips — and filtering on an empty staff_id would send '' to a
  // UUID column (Postgres syntax error), so skip the queries entirely.
  const staffId = staffProfile?.id ?? null;

  const { data: recentTransactions } = staffId
    ? await supabase
        .from('transactions')
        .select('id, amount, currency, created_at, status')
        .eq('staff_id', staffId)
        .order('created_at', { ascending: false })
        .limit(5)
    : { data: null };

  const { data: trendWindow } = staffId
    ? await supabase
        .from('transactions')
        .select('amount, created_at, status')
        .eq('staff_id', staffId)
        .eq('status', 'succeeded')
        .gte('created_at', fourteenDaysAgoIso)
    : { data: null };

  // All-time aggregate. A single SELECT sum() would be cleaner, but
  // staff dashboards only have O(1k) rows so we just fetch amounts.
  const { data: allTimeRows } = staffId
    ? await supabase
        .from('transactions')
        .select('amount, currency')
        .eq('staff_id', staffId)
        .eq('status', 'succeeded')
    : { data: null };
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

      {/* The count is the pitch: every tip this month was a customer who would
          have been asked for a review at the moment they were demonstrably
          happy. Shown only when the group actually has a review link and
          actually took tips — see getReviewTeaser for why both matter. */}
      {reviewTeaser && (
        <ProUpsell
          title={t('pro.reviewTeaserTitle', { count: reviewTeaser.tipCount })}
          body={t('pro.reviewTeaserBody')}
          cta={t('pro.reviewTeaserCta')}
        />
      )}

      {/* Group admin without any staff profile yet → invite them to join as staff */}
      {isGroupAdmin && !staffProfile && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 14,
          background: 'linear-gradient(135deg, rgba(229,122,151,0.08), rgba(236,151,176,0.05))',
          border: '1px solid rgba(229,122,151,0.25)',
          borderRadius: 'var(--radius)', padding: '16px 18px', marginBottom: 20,
        }}>
          <div style={{ display: 'flex', flexShrink: 0, color: 'var(--accent)' }}><CardIcon size={24} /></div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)', marginBottom: 3 }}>
              {t('home.adminReceiveTipsTitle')}
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--text-3)', lineHeight: 1.5 }}>
              {t('home.adminReceiveTipsBody')}
            </div>
          </div>
          <Link href="/dashboard/paiements" style={{
            padding: '9px 16px', borderRadius: 10, border: 'none',
            background: 'var(--accent)', color: '#fff',
            fontSize: 13, fontWeight: 600, textDecoration: 'none',
            whiteSpace: 'nowrap', flexShrink: 0,
          }}>
            {t('home.adminReceiveTipsCta')}
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
