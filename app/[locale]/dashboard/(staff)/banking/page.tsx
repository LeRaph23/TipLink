import { setRequestLocale, getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getStaffEarnings, getBankingState } from '@/actions/stripe';
import { BankingSetupForm } from './BankingSetupForm';

const card: React.CSSProperties = {
  background: 'var(--surface)', border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius)', padding: '24px',
};

// Line-style icons matching the dashboard set (currentColor stroke).
function UserIcon({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="5" r="3" /><path d="M2 14c0-3.314 2.686-5 6-5s6 1.686 6 5" />
    </svg>
  );
}
function CheckCircleIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="6.5" /><path d="M5.3 8.2l1.8 1.8 3.6-3.8" />
    </svg>
  );
}
function ClockIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="6.5" /><path d="M8 4.5V8l2.5 1.5" />
    </svg>
  );
}

export default async function BankingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('dashboard.banking');

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);

  const [{ data: staffProfile }, { data: roles }] = await Promise.all([
    supabase
      .from('staff_profiles')
      .select('id, full_name, stripe_account_id, onboarding_status')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .maybeSingle(),
    supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id),
  ]);

  // A group/super admin can receive tips too: the onboarding action bootstraps
  // a staff profile for them on first setup. So the page must let them start
  // even before that profile exists — they should never hit the "no profile,
  // contact your administrator" dead end (they ARE the administrator).
  const isAdmin = (roles ?? []).some(
    (r) => r.role === 'group_admin' || r.role === 'super_admin',
  );
  const canReceiveTips = !!staffProfile || isAdmin;

  // Resolve banking state straight from Stripe — this self-heals
  // onboarding_status (no dependency on the account.updated webhook) and returns
  // a precise state for the UI, plus the held balance.
  const { state, pendingBalance } = await getBankingState();
  const hasAccount = state !== 'none';
  const isComplete = state === 'complete';

  const earnings = hasAccount ? await getStaffEarnings() : null;
  const lifetimeNet = earnings && 'ok' in earnings ? earnings.lifetimeNet : null;
  const fmt = new Intl.NumberFormat(locale === 'fr' ? 'fr-FR' : 'en-US', {
    style: 'currency', currency: 'EUR', minimumFractionDigits: 2,
  });

  return (
    <div style={{ maxWidth: 520 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 19, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.03em' }}>
          {t('title')}
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 3 }}>
          {t('subtitle')}
        </p>
      </div>

      {!canReceiveTips ? (
        <div style={{ ...card, textAlign: 'center', color: 'var(--text-3)', fontSize: 13.5, padding: '32px 24px' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12, color: 'var(--text-3)' }}><UserIcon /></div>
          <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>{t('notLinkedTitle')}</div>
          <div>{t('notLinkedBody')}</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Held tips waiting to be collected */}
          {pendingBalance > 0 && (
            <div style={{ ...card, borderColor: 'var(--warning)', background: 'var(--warning-bg, #fff8e6)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ display: 'flex', color: 'var(--warning)', flexShrink: 0 }}><ClockIcon /></span>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--warning)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                  {t('pendingBalanceTitle')}
                </div>
              </div>
              <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.04em', lineHeight: 1 }}>
                {fmt.format(pendingBalance / 100)}
              </div>
              {!isComplete && (
                <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 8 }}>
                  {t('pendingBalanceBody')}
                </div>
              )}
            </div>
          )}

          {/* Earnings */}
          {hasAccount && lifetimeNet !== null && (
            <div style={card}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
                {t('totalReceived')}
              </div>
              <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.04em', lineHeight: 1 }}>
                {fmt.format(lifetimeNet / 100)}
              </div>
              {isComplete && (
                <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 8 }}>
                  {t.rich('autoPayout', { b: (c) => <strong>{c}</strong> })}
                </div>
              )}
            </div>
          )}

          {/* Status / setup */}
          <div style={card}>
            {isComplete ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
                <span style={{ display: 'flex', color: 'var(--success)', flexShrink: 0 }}><CheckCircleIcon /></span>
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--success)' }}>
                    {t('activeTitle')}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 1 }}>
                    {t('activeBody')}
                  </div>
                </div>
              </div>
            ) : state === 'verifying' || state === 'incomplete' ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
                <span style={{ display: 'flex', color: 'var(--warning)', flexShrink: 0 }}><ClockIcon /></span>
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--warning)' }}>
                    {state === 'verifying' ? t('pendingTitle') : t('incompleteTitle')}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 1 }}>
                    {state === 'verifying' ? t('pendingBody') : t('incompleteBody')}
                  </div>
                </div>
              </div>
            ) : null}

            <BankingSetupForm mode={isComplete ? 'update' : 'setup'} />
          </div>
        </div>
      )}
    </div>
  );
}
