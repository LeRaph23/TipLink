import { setRequestLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getStaffEarnings } from '@/actions/stripe';
import { BankingSetupForm } from './BankingSetupForm';

const card: React.CSSProperties = {
  background: 'var(--surface)', border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius)', padding: '24px',
};

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

  const { data: staffProfile } = await supabase
    .from('staff_profiles')
    .select('id, full_name, stripe_account_id, onboarding_status')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .maybeSingle();

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
          Reçois tes pourboires directement sur ton compte bancaire.
        </p>
      </div>

      {!staffProfile ? (
        <div style={{ ...card, textAlign: 'center', color: 'var(--text-3)', fontSize: 13.5, padding: '32px 24px' }}>
          <div style={{ fontSize: 28, marginBottom: 12 }}>👤</div>
          <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>Aucun profil staff</div>
          <div>
            Votre compte n&apos;est pas encore associé à un profil staff.
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
                  Tes pourboires sont versés <strong>automatiquement</strong> sur ton compte bancaire par Stripe.
                </div>
              )}
            </div>
          )}

          {/* Status / setup */}
          <div style={card}>
            {isComplete ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
                <span style={{ fontSize: 16 }}>✓</span>
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--success)' }}>
                    Compte bancaire actif
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 1 }}>
                    Tu reçois tes pourboires. Tu peux modifier tes coordonnées si besoin.
                  </div>
                </div>
              </div>
            ) : hasAccount ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
                <span style={{ fontSize: 16 }}>⏳</span>
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--warning)' }}>
                    Vérification en cours
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 1 }}>
                    Termine la configuration sur Stripe pour pouvoir recevoir tes pourboires.
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
