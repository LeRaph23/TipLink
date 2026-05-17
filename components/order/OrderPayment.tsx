'use client';

import { useMemo, useState } from 'react';
import { loadStripe, type Stripe, type StripeElementsOptions } from '@stripe/stripe-js';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';

let stripePromise: Promise<Stripe | null> | null = null;
function getStripe() {
  if (!stripePromise) {
    const pk = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    stripePromise = pk ? loadStripe(pk) : Promise.resolve(null);
  }
  return stripePromise;
}

export type OrderPaymentProps = {
  clientSecret: string;
  locale: string;
  htAmount: number;
  taxAmount: number;
  totalAmount: number;
  taxRatePercent: number | null;
};

// In-page payment for the /order wizard. Shipping/billing were already
// collected by the wizard and live on the PaymentIntent, so this only needs
// to capture the card and confirm — no Stripe-hosted redirect.
export function OrderPayment(props: OrderPaymentProps) {
  const options: StripeElementsOptions = {
    clientSecret: props.clientSecret,
    appearance: {
      theme: 'stripe',
      variables: {
        colorPrimary: '#E57A97',
        colorText: '#0f1020',
        borderRadius: '12px',
        fontFamily: 'Plus Jakarta Sans, system-ui, sans-serif',
      },
    },
  };
  return (
    <Elements stripe={getStripe()} options={options}>
      <PayForm
        locale={props.locale}
        htAmount={props.htAmount}
        taxAmount={props.taxAmount}
        totalAmount={props.totalAmount}
        taxRatePercent={props.taxRatePercent}
      />
    </Elements>
  );
}

function PayForm({
  locale,
  htAmount,
  taxAmount,
  totalAmount,
  taxRatePercent,
}: Omit<OrderPaymentProps, 'clientSecret'>) {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isFr = locale === 'fr';

  const fmt = useMemo(
    () => new Intl.NumberFormat(isFr ? 'fr-FR' : 'en-US', {
      style: 'currency', currency: 'EUR', minimumFractionDigits: 2,
    }),
    [isFr]
  );

  async function pay() {
    if (!stripe || !elements) return;
    setError(null);
    setLoading(true);
    const { error: err } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: `${window.location.origin}/${locale}/order/success` },
    });
    if (err) {
      setError(err.message ?? (isFr ? 'Le paiement a échoué.' : 'Payment failed.'));
      setLoading(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {error && (
        <div style={{
          padding: '12px 14px', borderRadius: 10,
          background: 'color-mix(in oklch, var(--error) 10%, transparent)',
          border: '1px solid color-mix(in oklch, var(--error) 35%, transparent)',
          color: 'var(--error)', fontSize: 13,
        }}>
          {error}
        </div>
      )}

      <PaymentElement options={{ layout: 'tabs' }} />

      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border-subtle)',
        borderRadius: 12, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 6,
      }}>
        <Row label={isFr ? 'Sous-total HT' : 'Subtotal excl. VAT'} value={fmt.format(htAmount / 100)} />
        <Row
          label={taxRatePercent != null ? `TVA (${taxRatePercent}%)` : 'TVA'}
          value={fmt.format(taxAmount / 100)}
        />
        <div style={{ height: 1, background: 'var(--border-subtle)', margin: '2px 0' }} />
        <Row label={isFr ? 'Total TTC' : 'Total incl. VAT'} value={fmt.format(totalAmount / 100)} bold />
      </div>

      <button
        type="button"
        onClick={() => { void pay(); }}
        disabled={!stripe || !elements || loading}
        style={{
          width: '100%', padding: '14px', borderRadius: 12, border: 'none',
          background: loading ? '#F2B3C4' : 'linear-gradient(135deg, #E57A97, #EC97B0)',
          color: '#fff', fontSize: 15, fontWeight: 700,
          cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'var(--font)',
        }}
      >
        {loading
          ? (isFr ? 'Traitement…' : 'Processing…')
          : `${isFr ? 'Payer' : 'Pay'} ${fmt.format(totalAmount / 100)}`}
      </button>

      <p style={{ fontSize: 11, color: 'var(--text-3)', textAlign: 'center', margin: 0 }}>
        {isFr ? 'Paiement sécurisé et chiffré par Stripe.' : 'Secure, encrypted payment by Stripe.'}
      </p>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: bold ? 14 : 13 }}>
      <span style={{ color: 'var(--text-2)', fontWeight: bold ? 700 : 500 }}>{label}</span>
      <span style={{ color: 'var(--text)', fontWeight: bold ? 800 : 600 }}>{value}</span>
    </div>
  );
}
