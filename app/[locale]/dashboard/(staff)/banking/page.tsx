import { setRequestLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getStaffStripeBalance } from '@/actions/stripe';
import { getAccountVerificationStatus } from '@/lib/stripe/identity';
import { BankingSetupForm } from './BankingSetupForm';
import { PayoutSection } from './PayoutSection';
import { StaffIdentityUpload } from './StaffIdentityUpload';

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

  const hasStripeAccount = !!staffProfile?.stripe_account_id;
  const mode = hasStripeAccount ? 'update' : 'setup';
  const fullName = staffProfile?.full_name ?? user.email?.split('@')[0] ?? 'Utilisateur';

  const balance = hasStripeAccount ? await getStaffStripeBalance() : null;

  let verification = null;
  if (hasStripeAccount && staffProfile?.stripe_account_id) {
    try {
      verification = await getAccountVerificationStatus(staffProfile.stripe_account_id);
    } catch {
      verification = null;
    }
  }

  return (
    <div style={{ maxWidth: 520 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 19, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.03em' }}>
          Virements
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 3 }}>
          {hasStripeAccount
            ? 'Mettez à jour votre IBAN pour recevoir vos pourboires.'
            : 'Configurez votre compte bancaire pour recevoir vos pourboires.'}
        </p>
      </div>

      {balance && !('error' in balance) && (
        <PayoutSection available={balance.available} pending={balance.pending} />
      )}

      {!staffProfile ? (
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius)', padding: '32px 24px', textAlign: 'center',
          color: 'var(--text-3)', fontSize: 13.5,
        }}>
          <div style={{ fontSize: 28, marginBottom: 12 }}>👤</div>
          <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
            Aucun profil staff
          </div>
          <div>
            Votre compte n&apos;est pas encore associé à un profil staff.
            Contactez votre administrateur pour accéder à cette fonctionnalité.
          </div>
        </div>
      ) : (
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius)', padding: '24px',
        }}>
          {hasStripeAccount && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 14px', borderRadius: 8,
              background: 'var(--success-bg)', marginBottom: 20,
            }}>
              <span style={{ fontSize: 16 }}>✓</span>
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--success)' }}>
                  Compte bancaire configuré
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 1 }}>
                  Vous recevez déjà des pourboires. Vous pouvez mettre à jour votre IBAN ci-dessous.
                </div>
              </div>
            </div>
          )}
          {verification?.needsIdentityDocument && (
            <div style={{ marginBottom: 20 }}>
              <StaffIdentityUpload pendingVerification={verification.pendingVerification} />
            </div>
          )}
          <BankingSetupForm mode={mode} fullName={fullName} />
        </div>
      )}
    </div>
  );
}
