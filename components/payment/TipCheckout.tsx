'use client';

import { useMemo, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { loadStripe, type Stripe, type StripeElementsOptions } from '@stripe/stripe-js';
import {
  Elements,
  ExpressCheckoutElement,
  PaymentElement,
  useElements,
  useStripe,
} from '@stripe/react-stripe-js';

interface Props {
  staffId: string;
  amount: number;    // total charge in cents = tipAmount + service fee
  tipAmount: number; // the tip the customer selected, in cents
  currency: string;
}

// Memoize the loadStripe promise across renders/instances (Stripe.js best practice)
let stripePromise: Promise<Stripe | null> | null = null;
function getStripe() {
  if (!stripePromise) {
    const pk = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    stripePromise = pk ? loadStripe(pk) : Promise.resolve(null);
  }
  return stripePromise;
}

export function TipCheckout({ staffId, amount, tipAmount, currency }: Props) {
  const options = useMemo<StripeElementsOptions>(
    () => ({
      mode: 'payment',
      amount,
      currency: currency.toLowerCase(),
      paymentMethodCreation: 'manual',
      appearance: {
        theme: 'night',
        variables: {
          colorPrimary: '#E57A97',
          borderRadius: '12px',
          fontFamily: 'inherit',
        },
      },
    }),
    [amount, currency]
  );

  return (
    <Elements stripe={getStripe()} options={options}>
      <InnerCheckout staffId={staffId} amount={amount} tipAmount={tipAmount} currency={currency} />
    </Elements>
  );
}

function InnerCheckout({ staffId, amount, tipAmount, currency }: Props) {
  const stripe = useStripe();
  const elements = useElements();
  const t = useTranslations('pay');
  const locale = useLocale();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCard, setShowCard] = useState(false);
  // Nonce is stable for the lifetime of this component (one attempt per mount).
  const [nonce] = useState(() =>
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random()}`
  );
  const [customerEmail, setCustomerEmail] = useState('');

  const fmt = new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
  });

  async function createIntent(): Promise<string | null> {
    const res = await fetch('/api/stripe/create-intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ staffId, amount, tipAmount, currency, nonce, customerEmail: customerEmail.trim() || undefined }),
    });
    const data = await res.json();
    if (!res.ok || !data.clientSecret) {
      setError(data.error ?? t('errors.initFailed'));
      return null;
    }
    return data.clientSecret as string;
  }

  async function confirm(clientSecret: string) {
    if (!stripe || !elements) return;
    const origin = window.location.origin;
    const { error: confirmError } = await stripe.confirmPayment({
      elements,
      clientSecret,
      confirmParams: {
        return_url: `${origin}/${locale}/pay/success`,
      },
    });
    if (confirmError) {
      setError(confirmError.message ?? t('errors.genericFailed'));
    }
  }

  const handleExpress = async () => {
    if (!stripe || !elements) return;
    setError(null);
    setIsLoading(true);
    try {
      const { error: submitError } = await elements.submit();
      if (submitError) {
        setError(submitError.message ?? t('errors.validationFailed'));
        return;
      }
      const clientSecret = await createIntent();
      if (!clientSecret) return;
      await confirm(clientSecret);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCardSubmit = async () => {
    if (!stripe || !elements) return;
    setError(null);
    setIsLoading(true);
    try {
      const { error: submitError } = await elements.submit();
      if (submitError) {
        setError(submitError.message ?? t('errors.validationFailed'));
        return;
      }
      const clientSecret = await createIntent();
      if (!clientSecret) return;
      await confirm(clientSecret);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      style={{
        padding: 20,
        borderRadius: 20,
        background: 'var(--surface)',
        border: '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      {error && (
        <p style={{ fontSize: 12, color: 'var(--error)', textAlign: 'center' }}>
          {error}
        </p>
      )}

      <div>
        <input
          type="email"
          value={customerEmail}
          onChange={e => setCustomerEmail(e.target.value)}
          placeholder={t('emailPlaceholder')}
          style={{
            width: '100%', padding: '10px 12px', borderRadius: 10,
            border: '1px solid var(--border)', background: 'var(--surface-2)',
            color: 'var(--text)', fontSize: 14, fontFamily: 'inherit',
            outline: 'none', boxSizing: 'border-box',
          }}
        />
        {customerEmail && (
          <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 5, textAlign: 'center' }}>
            {t('receiptNote')}
          </p>
        )}
      </div>

      {/* Real Apple Pay / Google Pay / Link buttons (if supported on this device). */}
      <ExpressCheckoutElement
        onConfirm={handleExpress}
        options={{
          buttonType: { applePay: 'tip', googlePay: 'donate' },
          buttonTheme: { applePay: 'black', googlePay: 'black' },
          layout: { maxColumns: 1, maxRows: 3 },
        }}
      />

      {!showCard && (
        <button
          type="button"
          onClick={() => setShowCard(true)}
          style={{
            width: '100%',
            padding: 11,
            borderRadius: 10,
            border: 'none',
            background: 'transparent',
            color: 'var(--text-2)',
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 500,
            fontFamily: 'var(--font)',
          }}
        >
          {t('payButton')}
        </button>
      )}

      {showCard && (
        <>
          <PaymentElement options={{ layout: 'tabs' }} />
          <button
            type="button"
            onClick={handleCardSubmit}
            disabled={!stripe || !elements || isLoading}
            style={{
              width: '100%',
              height: 52,
              borderRadius: 12,
              border: 'none',
              background: 'var(--accent)',
              color: '#fff',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              fontSize: 17,
              fontWeight: 600,
              letterSpacing: '-0.01em',
              opacity: isLoading ? 0.7 : 1,
            }}
          >
            {isLoading ? t('processingButton') : `${t('pay')} ${fmt.format(amount / 100)}`}
          </button>
        </>
      )}
    </div>
  );
}
