'use client';

import { useState, useCallback } from 'react';
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
            borderRadius: '12px',
            spacingUnit: '4px',
          },
        },
      });

      setConnectInstance(instance);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Initialization failed');
    } finally {
      setIsInitializing(false);
    }
  }, [hasAccount]);

  if (isComplete && !showManagement) {
    return (
      <div className="p-4 bg-green-50 border border-green-200 rounded-xl text-green-800 text-sm">
        Your payout account is set up and ready to receive tips.
      </div>
    );
  }

  if (!connectInstance) {
    return (
      <div className="space-y-3">
        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}
        <button
          onClick={initialize}
          disabled={isInitializing}
          className="w-full py-4 rounded-xl bg-foreground text-background font-semibold disabled:opacity-50"
        >
          {isInitializing
            ? 'Setting up...'
            : isComplete
              ? 'Manage Payout Account'
              : 'Set Up Payouts'}
        </button>
      </div>
    );
  }

  return (
    <ConnectComponentsProvider connectInstance={connectInstance}>
      <ConnectNotificationBanner />
      {isComplete && showManagement ? (
        <div className="space-y-4 mt-4">
          <ConnectBalances />
          <ConnectPayouts />
        </div>
      ) : (
        <ConnectAccountOnboarding
          onExit={() => {
            // Reload to re-check onboarding_status from DB after Stripe webhook fires
            window.location.reload();
          }}
        />
      )}
    </ConnectComponentsProvider>
  );
}
