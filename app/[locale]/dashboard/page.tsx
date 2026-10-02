import { getTranslations, setRequestLocale } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { hasPro } from '@/lib/billing/entitlements';
import { getReviewTeaser, getReviewImpact } from '@/lib/billing/review-teaser';
import { DismissibleProUpsell } from '@/components/billing/DismissibleProUpsell';
import { deriveTrialState } from '@/lib/billing/trial';
import { shouldShowProNudge } from '@/lib/dashboard/pro-nudge';
import { Link } from '@/i18n/navigation';
import { DigitipCard } from '@/components/dashboard/DigitipCard';
import { GettingStarted } from '@/components/dashboard/GettingStarted';
import { ReviewImpact } from '@/components/dashboard/ReviewImpact';
import { readGettingStarted } from '@/lib/dashboard/getting-started';
import { StatCard } from '@/components/dashboard/StatCard';
import { PageHeader } from '@/components/dashboard/ui';

function StatusBadge({ status, label }: { status: string; label: string }) {
  const map: Record<string, [string, string]> = {
    succeeded: ['var(--success-bg)', 'var(--success)'],
    pending:   ['var(--warning-bg)', 'var(--warning)'],
    failed:    ['var(--error-bg)',   'var(--error)'],
  };
  const [bg, color] = map[status] ?? ['var(--neutral-bg)', 'var(--neutral)'];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 8px', borderRadius: 100, fontSize: 11, fontWeight: 600, background: bg, color, whiteSpace: 'nowrap' }}>
      {status !== 'failed' && <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor', flexShrink: 0 }} />}
      {label}
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
  const tTxs = await getTranslations('dashboard.txs');

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


  // The Pro teaser is a group-admin concern: nobody else can act on it, and
  // showing an employee an upsell for their manager's subscription is noise.
  const adminGroupId =
    roles?.find((r) => (r.role === 'group_admin' || r.role === 'super_admin') && r.group_id)?.group_id ?? null;

  // What the manager still has to do, read from the same rows the rest of the
  // dashboard reads. Group admins only: nobody else can act on any of it.
  const gettingStarted = adminGroupId
    ? await readGettingStarted(createServiceClient(), adminGroupId)
    : null;

  // Two sides of the same number, and never both at once. A free group is told
  // what it gave up this month; a paying one is told what it got. The second
  // half only became possible with `review_clicks`: before that, a subscriber
  // had no way at all to tell whether the feature they pay for does anything.
  const { reviewTeaser, reviewImpact } = adminGroupId
    ? await (async () => {
        const service = createServiceClient();
        if (await hasPro(service, adminGroupId)) {
          return { reviewTeaser: null, reviewImpact: await getReviewImpact(service, adminGroupId) };
        }

        const teaser = await getReviewTeaser(service, adminGroupId);
        if (!teaser) return { reviewTeaser: null, reviewImpact: null };

        // The teaser used to appear on every visit for as long as the group
        // stayed free, which is how a suggestion becomes a nag. It is now the
        // monthly nudge: closeable, held for a month, and withheld from the
        // two groups it would be wrong for. Somebody on trial has the feature,
        // and somebody who cannot take a payment yet has a real problem that
        // this is not.
        const { data: group } = await service
          .from('groups')
          .select('settings, subscription_status, trial_ends_at')
          .eq('id', adminGroupId)
          .maybeSingle();

        const settings = (group?.settings as Record<string, unknown> | null) ?? {};
        const trial = deriveTrialState({
          plan: 'free',
          subscriptionStatus: group?.subscription_status ?? null,
          trialEndsAt: group?.trial_ends_at ?? null,
        });

        const show = shouldShowProNudge({
          isPro: false,
          trialing: trial.state === 'trialing',
          payable: Boolean(gettingStarted?.payable),
          tipCount: teaser.tipCount,
          dismissedAt: typeof settings.pro_nudge_dismissed_at === 'string'
            ? settings.pro_nudge_dismissed_at
            : null,
        });

        return { reviewTeaser: show ? teaser : null, reviewImpact: null };
      })()
    : { reviewTeaser: null, reviewImpact: null };

  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const fourteenDaysAgoIso = new Date(now - 14 * 24 * 60 * 60 * 1000).toISOString();

  // Whose tips this page counts. An employee (or an admin who also takes tips)
  // sees their own share. An admin with no staff profile takes no tips, so
  // "my tips" would read 0 € forever while the team is being paid: they see
  // the shares of every establishment in their group instead. Filtering on an
  // empty staff_id would also send '' to a UUID column, hence the explicit null.
  const staffId = staffProfile?.id ?? null;
  const teamEstablishmentIds = !staffId && adminGroupId
    ? ((await createServiceClient()
        .from('establishments')
        .select('id')
        .eq('group_id', adminGroupId)
        .is('deleted_at', null)).data ?? []).map((e) => e.id)
    : [];
  const teamScope = !staffId && teamEstablishmentIds.length > 0;

  // Earnings come from tip_allocations, not transactions, for two reasons.
  //
  // `transactions.amount` is what the CUSTOMER paid: since the 00073 fee model
  // that is the tip PLUS the service fee the tipper adds on top. Summing it
  // overstated every figure on this page by 25 c + 5 % per tip, so the weekly
  // email said "encaissé 105 €" where the bank showed 100 € and the Relevés
  // page — which already read tip_allocations — said 100 € too.
  //
  // And a group tip is written with `staff_id: null`, its per-person split
  // living only in tip_allocations. Filtering transactions on staff_id
  // therefore showed 0 € forever to every employee of a restaurant that only
  // uses the team tag.
  //
  // One read covers the recent list, the weekly trend and the all-time total;
  // these dashboards hold O(1k) rows.
  const ALLOC_COLUMNS = 'id, amount, allocated_at, status, transactions!inner(currency, establishment_id)';
  const { data: allocationRows } = staffId
    ? await supabase.from('tip_allocations').select(ALLOC_COLUMNS)
        .eq('staff_id', staffId)
        .order('allocated_at', { ascending: false, nullsFirst: false })
    : teamScope
      ? await supabase.from('tip_allocations').select(ALLOC_COLUMNS)
          .in('transactions.establishment_id', teamEstablishmentIds)
          .order('allocated_at', { ascending: false, nullsFirst: false })
      : { data: null };
  const allocations = allocationRows ?? [];

  const recentTransactions = allocations.slice(0, 5).map((a) => ({
    id: a.id,
    amount: a.amount,
    currency: (a.transactions as { currency?: string } | null)?.currency ?? 'EUR',
    created_at: a.allocated_at,
    // tip_allocations uses 'allocated' / 'reversed'; StatusBadge speaks the
    // transaction vocabulary, so map onto the equivalent it already renders.
    status: a.status === 'reversed' ? 'refunded' : 'succeeded',
  }));

  const earned = allocations.filter((a) => a.status === 'allocated');
  const trendWindow = earned.filter((a) => a.allocated_at && a.allocated_at >= fourteenDaysAgoIso);
  const allTimeRows = earned;
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  // `allocated_at` is nullable on rows predating 00075's rename. Dropping them
  // from the trend is right: a row with no date cannot be placed in a week, and
  // guessing one would quietly distort the comparison the arrow is based on.
  const datedAllocations = (trendWindow ?? []).flatMap((t) =>
    t.allocated_at ? [{ amount: t.amount, at: new Date(t.allocated_at).getTime() }] : [],
  );
  const thisWeekTxs = datedAllocations.filter((t) => now - t.at < weekMs);
  const thisWeekTotal = thisWeekTxs.reduce((sum, t) => sum + t.amount, 0);
  const lastWeekTotal = datedAllocations
    .filter((t) => {
      const d = now - t.at;
      return d >= weekMs && d < 2 * weekMs;
    })
    .reduce((sum, t) => sum + t.amount, 0);

  const minDataCents = 1000; // 10€
  const trend = lastWeekTotal >= minDataCents
    ? Math.round(((thisWeekTotal - lastWeekTotal) / lastWeekTotal) * 100)
    : undefined;

  const currency = recentTransactions[0]?.currency ?? 'EUR';
  const fmt = new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: 2 });
  const totalEarnings = allTimeRows?.reduce((sum, t) => sum + t.amount, 0) ?? 0;
  const hasEarnings = totalEarnings > 0;

  const statsGrid = (
    <div className="dash-stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 28 }}>
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
      <StatCard label={t('totalEarned')} value={totalEarnings / 100} format="currency" currency={currency} locale={locale} sub={teamScope ? `${t('allTime')} · ${t('home.wholeTeam')}` : t('allTime')} />
      <StatCard label={t('transactions')} value={thisWeekTxs.length} format="count" locale={locale} sub={t('home.last7days')} />
    </div>
  );

  return (
    <div className="stagger">
      <PageHeader
        title={t('home.dashboard')}
        subtitle={`${t('welcome')} ${staffProfile?.full_name ?? (user!.user_metadata?.full_name as string | undefined)?.split(' ')[0] ?? ''}`}
      />

      {/* The figure the manager opens the app for, first: it sat ~900 px down
          on a phone, under the checklist and the review card (UX-08). A brand
          new account with nothing earned yet still starts on the checklist. */}
      {hasEarnings && statsGrid}

      {/* Before anything else on the page: on a new account every card below
          this one shows a zero, and a screen full of zeroes with no next step
          is where a manager decides the product does not work yet. */}
      {gettingStarted && (
        <GettingStarted
          facts={gettingStarted}
          tipUrlPath={gettingStarted.tipUrlPath}
          locale={locale}
        />
      )}

      {staffProfile && staffProfile.onboarding_status === 'complete' && (
        <DigitipCard staffId={staffProfile.id} locale={locale} />
      )}

      {/* The count is the pitch: every tip this month was a customer who would
          have been asked for a review at the moment they were demonstrably
          happy. Shown only when the group actually has a review link and
          actually took tips — see getReviewTeaser for why both matter. */}
      {reviewImpact && <ReviewImpact impact={reviewImpact} />}

      {reviewTeaser && adminGroupId && (
        <DismissibleProUpsell
          groupId={adminGroupId}
          title={t('pro.reviewTeaserTitle', { count: reviewTeaser.tipCount })}
          body={t('pro.reviewTeaserBody')}
          cta={t('pro.reviewTeaserCta')}
        />
      )}


      {!hasEarnings && statsGrid}

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
              {!recentTransactions.length ? (
                <tr>
                  <td colSpan={3} style={{ padding: '36px 16px', textAlign: 'center' }}>
                    <div style={{ color: 'var(--text-3)', fontSize: 13 }}>{t('noTips')}</div>
                    {/* Only for the person who can do something about it. An
                        employee has no tag to place and no team to invite. */}
                    {gettingStarted?.tipUrlPath && (
                      <a
                        className="btn-ghost"
                        href={`/${locale}${gettingStarted.tipUrlPath}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          minHeight: 36, padding: '0 16px', borderRadius: 9, marginTop: 14,
                          border: '1px solid var(--border)', background: 'var(--surface-2)',
                          color: 'var(--text-2)', fontSize: 13, fontWeight: 600,
                          textDecoration: 'none', whiteSpace: 'nowrap',
                        }}
                      >
                        {t('gettingStarted.firstTip.cta')}
                      </a>
                    )}
                  </td>
                </tr>
              ) : recentTransactions.map(tx => (
                <tr key={tx.id} className="dash-row" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <td style={{ padding: '11px 16px', color: 'var(--text-3)', fontSize: 12.5 }}>
                    {tx.created_at
                      ? new Date(tx.created_at).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })
                      : '—'}
                  </td>
                  <td style={{ padding: '11px 16px', fontWeight: 700, letterSpacing: '-0.02em' }}>
                    {fmt.format(tx.amount / 100)}
                  </td>
                  <td style={{ padding: '11px 16px' }}>
                    <StatusBadge status={tx.status} label={tx.status === 'refunded' ? tTxs('statusReversed') : tTxs('statusReceived')} />
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
