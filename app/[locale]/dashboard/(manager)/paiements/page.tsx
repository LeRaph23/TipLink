import { setRequestLocale, getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { PaymentsPanel } from './PaymentsPanel';
import { getEstablishmentPayability } from '@/lib/stripe/establishment-account';

export const dynamic = 'force-dynamic';

const card: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius)',
  padding: 20,
};

/**
 * The establishment's payment account: verification status, business details,
 * bank account and payouts — all through Stripe's embedded components, so the
 * manager never leaves Digitip.
 *
 * Group-admin only. The Connect account is a billing-level concern, and this
 * page can change where the money lands.
 */
export default async function PaymentsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('dashboard.payments');

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);

  const { data: roleRow } = await supabase
    .from('user_roles')
    .select('group_id')
    .in('role', ['group_admin', 'super_admin'])
    .eq('user_id', user.id)
    .not('group_id', 'is', null)
    .limit(1)
    .maybeSingle();

  if (!roleRow?.group_id) redirect(`/${locale}/dashboard`);

  // Same reader the dashboard banner uses, so the two can never disagree about
  // whether this establishment can be paid.
  const est = await getEstablishmentPayability(createServiceClient(), roleRow.group_id);
  const ready = est?.state === 'ready';

  // Three situations, three sentences. Collapsing them into ready/not-ready is
  // what made this page unable to say whether the manager had something to do.
  const status =
    est?.state === 'ready' ? t('statusReady')
    : est?.state === 'verifying' ? t('statusPending')
    : est?.state === 'incomplete' ? t('statusIncomplete')
    : t('statusNotStarted');

  return (
    <div>
      <h1 style={{ fontSize: 19, fontWeight: 700, letterSpacing: '-0.03em', marginBottom: 4 }}>
        {t('title')}
      </h1>
      <p style={{ fontSize: 13.5, color: 'var(--text-3)', marginBottom: 20, lineHeight: 1.6 }}>
        {t('subtitle')}
      </p>

      {!est ? (
        <div style={{ ...card, fontSize: 13.5, color: 'var(--text-3)' }}>{t('noEstablishment')}</div>
      ) : (
        <>
          {/* Payability is the thing a manager actually wants to know, and the
              embedded components don't state it plainly — surface it above them. */}
          <div
            style={{
              ...card,
              marginBottom: 16,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <span
              aria-hidden
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: ready ? 'var(--success)' : 'var(--warning)',
                flexShrink: 0,
              }}
            />
            <div style={{ fontSize: 13.5, color: 'var(--text-2)', lineHeight: 1.6 }}>
              {status}
            </div>
          </div>

          {/* Why a third party is asking for an ID at all. Shown only while the
              KYC form is the thing on this page; once it is submitted the
              management panel speaks for itself. */}
          {!est.detailsSubmitted && (
            <div style={{ ...card, marginBottom: 16, fontSize: 12.5, color: 'var(--text-3)', lineHeight: 1.65 }}>
              {t.rich('verifyIntro', { b: (c) => <strong style={{ color: 'var(--text-2)' }}>{c}</strong> })}
            </div>
          )}

          <PaymentsPanel
            establishmentId={est.establishmentId}
            detailsSubmitted={est.detailsSubmitted}
            hasAccount={est.hasAccount}
          />
        </>
      )}
    </div>
  );
}
