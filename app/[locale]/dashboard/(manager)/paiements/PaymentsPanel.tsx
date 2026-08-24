'use client';

import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';

// Connect.js touches `window` and `getComputedStyle` while initialising, and
// the embedded iframes have nothing to prerender.
const EstablishmentAccountPanel = dynamic(
  () => import('@/components/stripe/EstablishmentAccountPanel').then((m) => m.EstablishmentAccountPanel),
  { ssr: false },
);

export function PaymentsPanel({ establishmentId }: { establishmentId: string }) {
  const t = useTranslations('dashboard.payments');

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
