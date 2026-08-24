'use client';

import {
  ConnectAccountManagement,
  ConnectNotificationBanner,
  ConnectPayouts,
} from '@stripe/react-connect-js';
import { ConnectProvider } from './ConnectProvider';

const card: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius)',
  padding: 20,
  marginBottom: 16,
};

const sectionLabel: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: 'var(--text-3)',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  marginBottom: 12,
};

type Props = {
  establishmentId: string;
  labels: { requirements: string; details: string; payouts: string };
  errorFallback?: React.ReactNode;
};

/**
 * The establishment's payment account, as embedded Stripe components.
 *
 * The notification banner and account management are not optional extras: on a
 * connected account with no Stripe-hosted dashboard where Stripe carries the
 * losses, they are how Stripe reaches the account holder for verification
 * requests at all. Drop them and an establishment whose documents expire has no
 * way to fix it and silently stops being payable.
 *
 * Import through `next/dynamic` with `ssr: false`.
 */
export function EstablishmentAccountPanel({ establishmentId, labels, errorFallback }: Props) {
  return (
    <ConnectProvider establishmentId={establishmentId} errorFallback={errorFallback}>
      <div style={{ marginBottom: 16 }}>
        <ConnectNotificationBanner
          collectionOptions={{ fields: 'eventually_due', futureRequirements: 'include' }}
        />
      </div>

      <div style={card}>
        <div style={sectionLabel}>{labels.details}</div>
        <ConnectAccountManagement
          collectionOptions={{ fields: 'eventually_due', futureRequirements: 'include' }}
        />
      </div>

      <div style={card}>
        <div style={sectionLabel}>{labels.payouts}</div>
        <ConnectPayouts />
      </div>
    </ConnectProvider>
  );
}
