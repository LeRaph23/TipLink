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
  establishmentId: string;
  amount: number;
  tipAmount: number;
  currency: string;
  staffCount: number;
}

let stripePromise: Promise<Stripe | null> | null = null;
function getStripe() {
  if (!stripePromise) {
    const pk = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    stripePromise = pk ? loadStripe(pk) : Promise.resolve(null);
  }
  return stripePromise;
}

export function GroupTipCheckout({ establishmentId, amount, tipAmount, currency, staffCount }: Props) {
  const options = useMemo<StripeElementsOptions>(
    () => ({
      mode: 'payment',
      amount,
      currency: currency.toLowerCase(),
      paymentMethodCreation: 'manual',
      appearance: {
        theme: 'night',
        variables: { colorPrimary: '#E57A97', borderRadius: '12px', fontFamily: 'inherit' },
      },
    }),
    [amount, currency]
  );

  return (
    <Elements stripe={getStripe()} options={options}>
      <InnerGroupCheckout
        establishmentId={establishmentId}
        amount={amount}
        tipAmount={tipAmount}
        currency={currency}
        staffCount={staffCount}
      />
    </Elements>
  );
}

function InnerGroupCheckout({ establishmentId, amount, tipAmount, currency, staffCount }: Props) {
  const stripe = useStripe();
  const elements = useElements();
  const t = useTranslations('pay');
  const locale = useLocale();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCard, setShowCard] = useState(false);
  const [nonce] = useState(() =>
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random()}`
  );
  const [customerEmail, setCustomerEmail] = useState('');

  const fmt = new Intl.NumberFormat(undefined, { style: 'currency', currency, minimumFractionDigits: 2 });

  async function createIntent(): Promise<string | null> {
    const res = await fetch('/api/stripe/create-group-intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        establishmentId, amount, tipAmount, currency, nonce,
        customerEmail: customerEmail.trim() || undefined,
      }),
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
    const { error: confirmError } = await stripe.confirmPayment({
      elements,
      clientSecret,
      confirmParams: { return_url: `${window.location.origin}/${locale}/pay/success` },
    });
    if (confirmError) setError(confirmError.message ?? t('errors.genericFailed'));
  }

  async function handlePay() {
    if (!stripe || !elements) return;
    setError(null);
    setIsLoading(true);
    try {
      const { error: submitError } = await elements.submit();
      if (submitError) { setError(submitError.message ?? t('errors.validationFailed')); return; }
      const clientSecret = await createIntent();
      if (!clientSecret) return;
      await confirm(clientSecret);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div style={{
      padding: 20, borderRadius: 20,
      background: 'var(--surface)', border: '1px solid var(--border-subtle)',
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      {staffCount > 1 && (
        <p style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'center', margin: 0 }}>
          Le pourboire sera réparti équitablement entre {staffCount} membres de l&apos;équipe
        </p>
      )}

      {error && (
        <p style={{ fontSize: 12, color: 'var(--error)', textAlign: 'center', margin: 0 }}>{error}</p>
      )}

      <ExpressCheckoutElement
        onConfirm={handlePay}
        options={{
          buttonHeight: 62,
          buttonType: { applePay: 'tip', googlePay: 'pay' },
          buttonTheme: { applePay: 'black', googlePay: 'black' },
          layout: { maxColumns: 1, maxRows: 3 },
        }}
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
        <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 500 }}>ou</span>
        <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
      </div>

      {!showCard ? (
        <button
          type="button"
          onClick={() => setShowCard(true)}
          style={{
            width: '100%', padding: '16px', borderRadius: 14, border: '1.5px solid var(--border)',
            background: 'var(--surface-2)', color: 'var(--text)',
            cursor: 'pointer', fontSize: 15, fontWeight: 700,
            fontFamily: 'var(--font)', letterSpacing: '-0.01em', transition: 'all 130ms',
          }}
        >
          💳 {t('payButton')}
        </button>
      ) : (
        <>
          <PaymentElement options={{ layout: 'tabs' }} />
          <button
            type="button"
            onClick={handlePay}
            disabled={!stripe || !elements || isLoading}
            style={{
              width: '100%', height: 58, borderRadius: 14, border: 'none',
              background: isLoading ? 'var(--accent-muted)' : 'var(--accent)',
              color: isLoading ? 'var(--accent)' : '#fff',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              fontSize: 17, fontWeight: 800, letterSpacing: '-0.02em', transition: 'all 130ms',
            }}
          >
            {isLoading ? t('processingButton') : `${t('pay')} ${fmt.format(amount / 100)}`}
          </button>
        </>
      )}

      <div>
        <label style={{ display: 'block', fontSize: 12, color: 'var(--text-3)', marginBottom: 6, letterSpacing: '0.01em' }}>
          {t('yourEmail')}
        </label>
        <input
          type="email"
          value={customerEmail}
          onChange={e => setCustomerEmail(e.target.value)}
          placeholder={t('emailPlaceholder')}
          style={{
            width: '100%', padding: '11px 12px', borderRadius: 10,
            border: '1px solid var(--border)', background: 'var(--surface-2)',
            color: 'var(--text)', fontSize: 14, fontFamily: 'inherit',
            outline: 'none', boxSizing: 'border-box',
          }}
        />
      </div>
    </div>
  );
}
