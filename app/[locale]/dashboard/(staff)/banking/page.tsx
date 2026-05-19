import { setRequestLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getStaffBalance, finalizeOnboardingSca } from '@/actions/mangopay';
import { BankingSetupForm } from './BankingSetupForm';
import { PayoutSection } from './PayoutSection';
import { StaffIdentityUpload } from './StaffIdentityUpload';

export default async function BankingPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ sca?: string }>;
}) {
  const { locale } = await params;
  const { sca } = await searchParams;
  setRequestLocale(locale);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);

  // Returning from the hosted SCA session — record the consent and refresh.
  if (sca === 'return') {
    await finalizeOnboardingSca().catch(() => null);
  }

  const { data: staffProfile } = await supabase
    .from('staff_profiles')
    .select('id, full_name, mangopay_user_id, mangopay_kyc_status, onboarding_status')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .maybeSingle();

  const hasStripeAccount = !!staffProfile?.mangopay_user_id;
  const mode = hasStripeAccount ? 'update' : 'setup';
  const fullName = staffProfile?.full_name ?? user.email?.split('@')[0] ?? 'Utilisateur';

  const balance = hasStripeAccount ? await getStaffBalance() : null;

  // KYC: an identity proof is needed when none has been submitted yet, or a
  // previous one was refused; 'pending' means it is awaiting Mangopay review.
  const kycStatus = staffProfile?.mangopay_kyc_status ?? 'none';
  const verification = hasStripeAccount
    ? {
        needsIdentityDocument: kycStatus === 'none' || kycStatus === 'refused',
        pendingVerification: kycStatus === 'pending',
      }
    : null;

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
