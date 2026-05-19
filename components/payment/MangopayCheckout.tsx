'use client';

import { useEffect, useRef, useState } from 'react';

// Reusable Mangopay Checkout SDK card form. The SDK is loaded from
// checkout.mangopay.com (PCI — never bundled) and handles tokenization and the
// 3DS redirect internally. Two backend callbacks drive it:
//   onCreateCardRegistration -> POST /api/mangopay/create-card-registration
//   onCreatePayment          -> POST {createPaymentUrl}
//
// NOTE: the exact SDK runtime API (event payloads, loader entry point) must be
// verified against the live SDK in a browser — see docs/migration-mangopay.md.

type PayInResult = { Id: string; Status?: string };

interface Props {
  amount: number; // total charge, in cents
  currency: string;
  // Backend route serving the SDK's onCreatePayment callback.
  createPaymentUrl: string;
  // Extra fields merged into the create-payment POST body (staffId, nonce…).
  paymentContext: Record<string, unknown>;
  onSuccess: (payIn: PayInResult) => void;
  onError?: (message: string) => void;
}

export function MangopayCheckout({
  amount,
  currency,
  createPaymentUrl,
  paymentContext,
  onSuccess,
  onError,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const clientId = process.env.NEXT_PUBLIC_MANGOPAY_CLIENT_ID;

  // Keep the latest callbacks/context in refs so the SDK is initialised once
  // per amount change, not on every parent re-render.
  const ctxRef = useRef(paymentContext);
  const successRef = useRef(onSuccess);
  const errorRef = useRef(onError);
  useEffect(() => {
    ctxRef.current = paymentContext;
    successRef.current = onSuccess;
    errorRef.current = onError;
  });

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !clientId) return;

    let cancelled = false;
    let instance: { unmount?: () => void } | null = null;

    (async () => {
      try {
        const mod = await import('@mangopay/checkout-sdk');
        const { CheckoutSdk } = mod;

        const onCreateCardRegistration = async (cardType: string) => {
          const res = await fetch('/api/mangopay/create-card-registration', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cardType }),
          });
          if (!res.ok) throw new Error('card registration failed');
          return res.json();
        };

        const onCreatePayment = async (data?: { CardId?: string; UserId?: string }) => {
          const res = await fetch(createPaymentUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              cardId: data?.CardId,
              mangopayUserId: data?.UserId,
              ...ctxRef.current,
            }),
          });
          const payIn = await res.json();
          if (!res.ok) throw new Error(payIn?.error ?? 'payment failed');
          return payIn;
        };

        // The SDK's option/enum types are intentionally loosened here — the
        // runtime contract (documented above) is what matters.
        const options = {
          clientId,
          profilingMerchantId: clientId,
          environment: process.env.NEXT_PUBLIC_MANGOPAY_ENVIRONMENT ?? 'SANDBOX',
          amount: { currency: currency.toUpperCase(), value: amount },
          paymentMethods: [
            { type: 'card', options: { enableSaveCard: false, onCreateCardRegistration, onCreatePayment } },
          ],
        } as unknown as Parameters<typeof CheckoutSdk.loadCheckoutSdk>[1];

        const sdk = await CheckoutSdk.loadCheckoutSdk(el, options);
        if (cancelled) {
          sdk.unmount();
          return;
        }
        instance = sdk;

        sdk.on('paymentComplete', (event) => {
          const payIn = (event as CustomEvent).detail as PayInResult;
          successRef.current(payIn);
        });
        sdk.on('error', (event) => {
          const detail = (event as CustomEvent).detail as { message?: string } | undefined;
          errorRef.current?.(detail?.message ?? 'Le paiement a échoué.');
        });
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Erreur de chargement du paiement.');
        }
      }
    })();

    return () => {
      cancelled = true;
      instance?.unmount?.();
    };
  }, [amount, currency, createPaymentUrl, clientId]);

  if (!clientId || loadError) {
    return (
      <p style={{ fontSize: 12, color: 'var(--error)', textAlign: 'center', margin: 0 }}>
        {loadError ?? 'Paiement temporairement indisponible.'}
      </p>
    );
  }

  return <div ref={containerRef} />;
}
