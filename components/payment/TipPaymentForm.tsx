'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { loadStripe, type Stripe, type StripeElementsOptions, type StripeError } from '@stripe/stripe-js';
import {
  Elements,
  ExpressCheckoutElement,
  PaymentElement,
  useElements,
  useStripe,
} from '@stripe/react-stripe-js';
import { PayError } from '@/components/pay/ui';
import { Link } from '@/i18n/navigation';
import { tipElementsAppearance } from '@/lib/stripe/tip-appearance';
import { moneyFormatter } from '@/lib/money';
import { PayButton, PayField, TextAction, useSiteTheme } from './tip-ui';

// Shared by the single-staff and the team tip. The intent routes create the
// PaymentIntent with `payment_method_types: ['card']`, which must match the
// `paymentMethodTypes` below. Apple Pay and Google Pay are cards, so they stay.
interface Props {
  /** `/api/stripe/create-intent` or `/api/stripe/create-group-intent`. */
  endpoint: string;
  /** Everything the route needs except `amount`, `currency`, `nonce` and the email. */
  body: Record<string, unknown>;
  amount: number; // total charge in cents = tip + service fee
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

function newNonce() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;
}

export function TipPaymentForm(props: Props) {
  const { amount, currency } = props;
  const options = useMemo<StripeElementsOptions>(
    () => ({
      mode: 'payment',
      amount,
      currency: currency.toLowerCase(),
      paymentMethodCreation: 'manual',
      // Card only. Link, Klarna, Bancontact and EPS filled the page with a
      // "save my details" form between the card and the pay button, which sat
      // 2.4 screens down on a phone (UI/UX audit, UX-01).
      paymentMethodTypes: ['card'],
      appearance: tipElementsAppearance(),
    }),
    [amount, currency],
  );

  return (
    <Elements stripe={getStripe()} options={options}>
      <InnerForm {...props} />
    </Elements>
  );
}

function InnerForm({ endpoint, body, amount, currency }: Props) {
  const stripe = useStripe();
  const elements = useElements();
  const t = useTranslations('pay');
  const locale = useLocale();
  const fmt = moneyFormatter(locale, currency, 2);
  // White in dark mode: a black wallet button on a near-black page has no
  // visible edge.
  const walletColor = useSiteTheme() === 'dark' ? 'white' : 'black';

  const [isLoading, setIsLoading] = useState(false);
  const [slow, setSlow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasWallet, setHasWallet] = useState(false);
  const [showEmail, setShowEmail] = useState(false);
  const [customerEmail, setCustomerEmail] = useState('');
  // The PaymentIntent of the current amount and email. After a declined card
  // the intent is back to `requires_payment_method` and is confirmed again
  // with the next card; creating a second one under the same nonce failed
  // with "Impossible d'initier le paiement" (UX-02).
  const intentRef = useRef<{ key: string; secret: string } | null>(null);

  // Back from the thank-you page, the browser restores this page from its
  // cache as it was when it left: the button frozen on "Processing…" and the
  // intent already paid (sixth QA run). A fresh load gives the next customer
  // a clean form.
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => { if (e.persisted) window.location.reload(); };
    window.addEventListener('pageshow', onShow);
    return () => window.removeEventListener('pageshow', onShow);
  }, []);

  // After 4 s of processing, say not to close the page: the most anxious
  // moment of the whole flow is the wait after "Pay" (UX-07).
  useEffect(() => {
    if (!isLoading) return;
    const id = window.setTimeout(() => setSlow(true), 4000);
    return () => { window.clearTimeout(id); setSlow(false); };
  }, [isLoading]);

  async function getClientSecret(): Promise<string | null> {
    const email = customerEmail.trim();
    const key = `${amount}|${email}`;
    if (intentRef.current?.key === key) return intentRef.current.secret;
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...body,
          amount,
          currency,
          nonce: newNonce(),
          customerEmail: email || undefined,
        }),
      });
      const data = await res.json().catch(() => ({} as { clientSecret?: string; error?: string }));
      if (!res.ok || !data.clientSecret) {
        setError(t(data.error === 'payment_unavailable' ? 'errors.paymentUnavailable' : 'errors.initFailed'));
        return null;
      }
      intentRef.current = { key, secret: data.clientSecret as string };
      return data.clientSecret as string;
    } catch (e) {
      // Network failure / non-JSON response — never leave the button spinning.
      console.error('[pay] create intent failed', e);
      setError(t('errors.initFailed'));
      return null;
    }
  }

  function confirmErrorMessage(err: StripeError): string {
    if (err.type === 'card_error' && (err.code === 'card_declined' || err.decline_code)) {
      return t('errors.declined');
    }
    return err.message ?? t('errors.genericFailed');
  }

  async function handlePay() {
    if (!stripe || !elements) return;
    setError(null);
    setIsLoading(true);
    try {
      const { error: submitError } = await elements.submit();
      if (submitError) {
        // Stripe already shows field errors inside the form; repeating them
        // here printed every "incomplete number" twice.
        if (submitError.type !== 'validation_error') {
          setError(submitError.message ?? t('errors.validationFailed'));
        }
        return;
      }
      const clientSecret = await getClientSecret();
      if (!clientSecret) return;
      const { error: confirmError } = await stripe.confirmPayment({
        elements,
        clientSecret,
        confirmParams: { return_url: `${window.location.origin}/${locale}/pay/success` },
      });
      if (confirmError) setError(confirmErrorMessage(confirmError));
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Apple Pay / Google Pay first: on a phone that has them, the fastest
          way to tip standing at a counter. Renders nothing elsewhere. */}
      <ExpressCheckoutElement
        onConfirm={handlePay}
        onReady={(e) => setHasWallet(Boolean(e.availablePaymentMethods))}
        options={{
          buttonHeight: 55,
          buttonType: { applePay: 'tip', googlePay: 'pay' },
          buttonTheme: { applePay: walletColor, googlePay: walletColor },
          layout: { maxColumns: 1, maxRows: 2 },
          paymentMethods: { link: 'never' },
        }}
      />

      {hasWallet && (
        <div
          aria-hidden
          style={{
            display: 'flex', alignItems: 'center', gap: 10,
            font: '500 12px/16px var(--font)', color: 'var(--text-3)', margin: '4px 0',
          }}
        >
          <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          {t('orByCard')}
          <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        </div>
      )}

      {/* The card form at once: it was behind a "Pay by card" link (UX-01). */}
      <PaymentElement
        options={{ layout: 'tabs', wallets: { applePay: 'never', googlePay: 'never' } }}
        onChange={() => setError(null)}
      />

      {/* Receipt email: optional, so folded away, and above the button — a
          field below the button is never filled in (UX-06). */}
      {showEmail ? (
        <div className="dg-reveal">
          <PayField
            id="tip-email"
            type="email"
            autoComplete="email"
            label={t('yourEmail')}
            value={customerEmail}
            onChange={(e) => setCustomerEmail(e.target.value)}
            placeholder={t('emailPlaceholder')}
          />
        </div>
      ) : (
        <TextAction onClick={() => setShowEmail(true)}>{t('receiptToggle')}</TextAction>
      )}

      {/* The pay button and its errors stay at the bottom of the screen, where
          the thumb is, from the moment an amount is chosen (UX-01, UX-02). */}
      <div
        style={{
          position: 'sticky', bottom: 0, zIndex: 2,
          margin: '0 -4px', padding: '16px 4px calc(12px + env(safe-area-inset-bottom))',
          background: 'linear-gradient(to bottom, transparent, var(--bg) 16px)',
          display: 'flex', flexDirection: 'column', gap: 10,
        }}
      >
        {error && (
          <div className="alert-in">
            <PayError>{error}</PayError>
          </div>
        )}
        <PayButton onClick={handlePay} disabled={!stripe || !elements} loading={isLoading}>
          {isLoading ? t('processingButton') : (
            <span>
              {t('pay')}{' '}
              <span key={amount} className="amount-tick" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {fmt.format(amount / 100)}
              </span>
            </span>
          )}
        </PayButton>
        {/* Pre-contractual notice owed to the consumer before paying the
            service fee (L.221-5, L.221-28 1° C. conso). */}
        <p style={{ margin: 0, textAlign: 'center', font: '400 11.5px/16px var(--font)', color: 'var(--text-3)' }}>
          {t.rich('legal.payNotice', {
            terms: (c) => <Link href="/conditions-pourboire" target="_blank" style={{ color: 'inherit', textDecoration: 'underline' }}>{c}</Link>,
          })}
        </p>
        {slow && (
          <p className="fade-in" style={{ margin: 0, textAlign: 'center', font: '400 13px/18px var(--font)', color: 'var(--text-2)' }}>
            {t('dontClose')}
          </p>
        )}
      </div>
    </div>
  );
}
