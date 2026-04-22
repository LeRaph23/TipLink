'use client';

import { useState } from 'react';

interface Props {
  staffId: string;
  amount: number;
  currency: string;
  nonce: string;
}

export function CheckoutForm({ staffId, amount, currency, nonce }: Props) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCheckout = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/stripe/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staffId, amount, currency, nonce }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? 'Payment failed. Please try again.');
        return;
      }

      // Redirect to Stripe-hosted checkout (includes Apple Pay / Google Pay).
      // The backend returns a sessionUrl pointing to Stripe's hosted page.
      if (data.sessionUrl) {
        window.location.href = data.sessionUrl;
      } else {
        setError('Payment session unavailable.');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const formatter = new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
  });

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-card p-4 text-center">
        <p className="text-sm text-muted-foreground">You are tipping</p>
        <p className="text-4xl font-bold mt-1">{formatter.format(amount / 100)}</p>
      </div>

      {error && (
        <p className="text-sm text-destructive text-center">{error}</p>
      )}

      <button
        onClick={handleCheckout}
        disabled={isLoading}
        className="w-full py-4 rounded-xl bg-foreground text-background font-semibold text-base transition-opacity disabled:opacity-50"
      >
        {isLoading ? 'Redirecting...' : 'Pay with Card / Apple Pay / Google Pay'}
      </button>

      <p className="text-xs text-center text-muted-foreground">
        Secure payment via Stripe. No card details stored on this site.
      </p>
    </div>
  );
}
