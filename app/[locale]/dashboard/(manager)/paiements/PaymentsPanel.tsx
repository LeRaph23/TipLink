'use client';

import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';

// Connect.js touches `window` and `getComputedStyle` while initialising, and
// the embedded iframes have nothing to prerender.
const EstablishmentAccountPanel = dynamic(
  () => import('@/components/stripe/EstablishmentAccountPanel').then((m) => m.EstablishmentAccountPanel),
  { ssr: false },
);

const EstablishmentVerification = dynamic(
  () => import('@/components/stripe/EstablishmentVerification').then((m) => m.EstablishmentVerification),
  { ssr: false },
);

export function PaymentsPanel({
  establishmentId,
  /** Stripe has the KYC form. Until then this page IS the KYC form. */
  detailsSubmitted,
  hasAccount,
}: {
  establishmentId: string;
  detailsSubmitted: boolean;
  hasAccount: boolean;
}) {
  const t = useTranslations('dashboard.payments');

  // Account management assumes an account that has been through onboarding; on
  // one that never submitted anything it is a settings screen for settings that
  // do not exist yet. The onboarding form is what belongs here first.
  if (!detailsSubmitted) {
    return (
      <EstablishmentVerification
        establishmentId={establishmentId}
        hasAccount={hasAccount}
        labels={{
          legalTitle: t('legalTitle'),
          legalCompany: t('legalCompany'),
          legalIndividual: t('legalIndividual'),
          loadFailed: t('verifyLoadFailed'),
          exited: t('verifyExited'),
          checking: t('verifyChecking'),
        }}
      />
    );
  }

  return (
    <EstablishmentAccountPanel
      establishmentId={establishmentId}
      labels={{
        requirements: t('requirements'),
        details: t('details'),
        payouts: t('payouts'),
      }}
      errorFallback={
        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius)',
            padding: 20,
            fontSize: 13,
            color: 'var(--error)',
            lineHeight: 1.6,
          }}
        >
          {t('loadFailed')}
        </div>
      }
    />
  );
}
