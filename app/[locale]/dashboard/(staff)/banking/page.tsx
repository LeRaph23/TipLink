import { setRequestLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getStaffEarnings } from '@/actions/stripe';
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

  const hasAccount = !!staffProfile?.stripe_account_id;
  const isComplete = staffProfile?.onboarding_status === 'complete';

  const earnings = hasAccount ? await getStaffEarnings() : null;
  const lifetimeNet = earnings && 'ok' in earnings ? earnings.lifetimeNet : null;
  const fmt = new Intl.NumberFormat(locale === 'fr' ? 'fr-FR' : 'en-US', {
    style: 'currency', currency: 'EUR', minimumFractionDigits: 2,
  });

  return (
    <div style={{ maxWidth: 520 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 19, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.03em' }}>
          Virements
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 3 }}>
          Recevez vos pourboires directement sur votre compte bancaire.
        </p>
      </div>

      {!canReceiveTips ? (
        <div style={{ ...card, textAlign: 'center', color: 'var(--text-3)', fontSize: 13.5, padding: '32px 24px' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12, color: 'var(--text-3)' }}><UserIcon /></div>
          <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>Compte non rattaché</div>
          <div>
            Votre compte n&apos;est pas encore rattaché à un établissement.
            Contactez votre administrateur pour accéder à cette fonctionnalité.
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Earnings */}
          {hasAccount && lifetimeNet !== null && (
            <div style={card}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
                Total reçu
              </div>
              <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.04em', lineHeight: 1 }}>
                {fmt.format(lifetimeNet / 100)}
              </div>
              {isComplete && (
                <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 8 }}>
                  Vos pourboires sont versés <strong>automatiquement</strong> sur votre compte bancaire par Stripe.
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
                    Compte bancaire actif
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 1 }}>
                    Vous recevez vos pourboires. Vous pouvez modifier vos coordonnées si besoin.
                  </div>
                </div>
              </div>
            ) : hasAccount ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
                <span style={{ display: 'flex', color: 'var(--warning)', flexShrink: 0 }}><ClockIcon /></span>
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--warning)' }}>
                    Vérification en cours
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 1 }}>
                    Terminez la configuration sur Stripe pour pouvoir recevoir vos pourboires.
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
