'use client';

import { useEffect, useMemo, useState } from 'react';
import { tipElementsAppearance } from '@/lib/stripe/tip-appearance';
import { useTranslations, useLocale } from 'next-intl';
import { loadStripe, type Stripe, type StripeElementsOptions } from '@stripe/stripe-js';
import {
  Elements,
  ExpressCheckoutElement,
  PaymentElement,
  useElements,
  useStripe,
} from '@stripe/react-stripe-js';
import { PayError } from '@/components/pay/ui';
import { PayButton, PayField, TextAction, useSiteTheme } from './tip-ui';
import { moneyFormatter } from '@/lib/money';

interface Props {
  establishmentId: string;
  amount: number;    // total charge in cents = tipAmount + service fee
  tipAmount: number; // the tip the customer selected, in cents
  currency: string;
}

let stripePromise: Promise<Stripe | null> | null = null;
function getStripe() {
  if (!stripePromise) {
    const pk = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    stripePromise = pk ? loadStripe(pk) : Promise.resolve(null);
  }
  return stripePromise;
}

export function GroupTipCheckout({ establishmentId, amount, tipAmount, currency }: Props) {
  const options = useMemo<StripeElementsOptions>(
    () => ({
      mode: 'payment',
      amount,
      currency: currency.toLowerCase(),
      paymentMethodCreation: 'manual',
      appearance: tipElementsAppearance(),
    }),
    [amount, currency]
  );

  return (
    <Elements stripe={getStripe()} options={options}>
      <InnerGroupCheckout establishmentId={establishmentId} amount={amount} tipAmount={tipAmount} currency={currency} />
    </Elements>
  );
}

function InnerGroupCheckout({ establishmentId, amount, tipAmount, currency }: Props) {
  const stripe = useStripe();
  const elements = useElements();
  const t = useTranslations('pay');
  const locale = useLocale();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Back from the thank-you page, the browser restores this page from its
  // cache as it was when it left: the button frozen on "Processing…" and the
  // one-time nonce already spent on the previous tip (sixth QA run). A fresh
  // load gives the next customer a clean form.
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => { if (e.persisted) window.location.reload(); };
    window.addEventListener('pageshow', onShow);
    return () => window.removeEventListener('pageshow', onShow);
  }, []);
  const [showCard, setShowCard] = useState(false);
  const [nonce] = useState(() =>
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random()}`
  );
  const [customerEmail, setCustomerEmail] = useState('');
  const walletColor = useSiteTheme() === 'dark' ? 'white' : 'black';
  const walletTheme = { applePay: walletColor, googlePay: walletColor } as const;

  // The page locale, not the device's: the server rendered "€2" and the
  // browser "2 €", a hydration mismatch on every tip page (sixth QA run).
  const pageLocale = locale;
  const fmt = moneyFormatter(pageLocale, currency, 2);

  async function createIntent(): Promise<string | null> {
    try {
      const res = await fetch('/api/stripe/create-group-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          establishmentId, amount, tipAmount, currency, nonce,
          customerEmail: customerEmail.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({} as { clientSecret?: string }));
      if (!res.ok || !data.clientSecret) {
        setError(t('errors.initFailed'));
        return null;
      }
      return data.clientSecret as string;
    } catch (e) {
      console.error('[pay] create-group-intent failed', e);
      setError(t('errors.initFailed'));
      return null;
    }
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
    <>
      <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {error && <PayError>{error}</PayError>}

        {/* Apple Pay / Google Pay / Link. White in dark mode: a black button
            on a near-black page has no visible edge. */}
        <ExpressCheckoutElement
          onConfirm={handlePay}
          options={{
            buttonHeight: 55,
            buttonType: { applePay: 'tip', googlePay: 'pay' },
            buttonTheme: walletTheme,
            layout: { maxColumns: 1, maxRows: 3 },
          }}
        />

        {/* Card — a small text link instead of a big second button. */}
        {!showCard ? (
          <TextAction icon="card" onClick={() => setShowCard(true)}>{t('payButton')}</TextAction>
        ) : (
          <div className="dg-reveal" style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
            <PaymentElement options={{ layout: 'tabs' }} onChange={() => setError(null)} />
            <PayButton onClick={handlePay} disabled={!stripe || !elements} loading={isLoading}>
              {isLoading ? t('processingButton') : `${t('pay')} ${fmt.format(amount / 100)}`}
            </PayButton>
          </div>
        )}
      </div>

      {/* Email — always visible, clearly optional */}
      <div style={{ marginTop: 24 }}>
        <PayField
          id="tip-email"
          type="email"
          autoComplete="email"
          label={t('yourEmail')}
          value={customerEmail}
          onChange={e => setCustomerEmail(e.target.value)}
          placeholder={t('emailPlaceholder')}
        />
      </div>
    </>
  );
}
