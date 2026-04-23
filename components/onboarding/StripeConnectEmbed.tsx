'use client';

import { useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { loadConnectAndInitialize, type StripeConnectInstance } from '@stripe/connect-js';
import {
  ConnectComponentsProvider,
  ConnectAccountOnboarding,
  ConnectNotificationBanner,
  ConnectBalances,
  ConnectPayouts,
} from '@stripe/react-connect-js';
import { createStripeConnectAccount } from '@/actions/stripe';

interface Props {
  hasAccount: boolean;
  isComplete: boolean;
  /** If true, show management components (balance, payouts) after onboarding */
  showManagement?: boolean;
}

export function StripeConnectEmbed({ hasAccount, isComplete, showManagement = false }: Props) {
  const t = useTranslations('dashboard.onboarding');
  const [connectInstance, setConnectInstance] = useState<StripeConnectInstance | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initialize = useCallback(async () => {
    setIsInitializing(true);
    setError(null);

    try {
      if (!hasAccount) {
        const result = await createStripeConnectAccount();
        if ('error' in result) {
          setError(result.error);
          return;
        }
      }

      const instance = loadConnectAndInitialize({
        publishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!,
        fetchClientSecret: async () => {
          const res = await fetch('/api/stripe/account-session', { method: 'POST' });
          if (!res.ok) throw new Error('Failed to initialize payment account session');
          const { client_secret } = await res.json();
          return client_secret;
        },
        appearance: {
          overlays: 'dialog',
          variables: {
            borderRadius: '10px',
            spacingUnit: '4px',
            colorPrimary: '#6366f1',
            colorBackground: '#17171d',
            colorText: '#f2f2f5',
            colorSecondaryText: '#9898a8',
            colorBorder: '#2e2e38',
          },
        },
      });

      setConnectInstance(instance);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('initFailed'));
    } finally {
      setIsInitializing(false);
    }
  }, [hasAccount, t]);

  if (isComplete && !showManagement) {
    return (
      <div style={{
        padding: '14px 18px', borderRadius: 'var(--radius)',
        background: 'var(--success-bg)',
        border: '1px solid color-mix(in oklch, var(--success) 30%, transparent)',
        color: 'var(--success)', fontSize: 13.5, fontWeight: 500,
      }}>
        {t('ready')}
      </div>
    );
  }

  if (!connectInstance) {
    return (
      <div>
        {error && (
          <p style={{ fontSize: 12.5, color: 'var(--error)', marginBottom: 10 }}>{error}</p>
        )}
        <button
          type="button"
          onClick={initialize}
          disabled={isInitializing}
          style={{
            width: '100%', padding: '13px 18px', borderRadius: 'var(--radius)',
            background: 'var(--accent)', color: 'var(--accent-fg)',
            fontSize: 14, fontWeight: 700, border: 'none',
            cursor: isInitializing ? 'not-allowed' : 'pointer',
            opacity: isInitializing ? 0.6 : 1, fontFamily: 'var(--font)',
          }}
        >
          {isInitializing
            ? t('initializing')
            : isComplete
              ? t('continue')
              : t('start')}
        </button>
      </div>
    );
  }

  return (
    <ConnectComponentsProvider connectInstance={connectInstance}>
      <ConnectNotificationBanner />
      {isComplete && showManagement ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 16 }}>
          <ConnectBalances />
          <ConnectPayouts />
        </div>
      ) : (
        <ConnectAccountOnboarding
          onExit={() => {
            window.location.reload();
          }}
        />
      )}
    </ConnectComponentsProvider>
  );
}
