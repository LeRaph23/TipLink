'use client';

import { useEffect, useMemo, useState } from 'react';
import { loadStripe, type Stripe, type StripeElementsOptions } from '@stripe/stripe-js';
import {
  AddressElement,
  Elements,
  ExpressCheckoutElement,
  LinkAuthenticationElement,
  PaymentElement,
  useElements,
  useStripe,
} from '@stripe/react-stripe-js';

type Pack = 'solo' | 'duo';

interface Props {
  pack: Pack;
  locale: string;
}

const ALLOWED_SHIPPING_COUNTRIES: Array<
  'FR' | 'BE' | 'IE' | 'ES' | 'DE' | 'IT' | 'NL' | 'LU' | 'PT' | 'AT' | 'FI' | 'GR'
> = ['FR', 'BE', 'IE', 'ES', 'DE', 'IT', 'NL', 'LU', 'PT', 'AT', 'FI', 'GR'];

let stripePromise: Promise<Stripe | null> | null = null;
function getStripe() {
  if (!stripePromise) {
    const pk = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    stripePromise = pk ? loadStripe(pk) : Promise.resolve(null);
  }
  return stripePromise;
}

type IntentData = {
  clientSecret: string;
  amount: number;
  baseAmount: number;
  discountAmount: number;
  promoCode: string | null;
};

type CachedIntent = { key: string; data: IntentData } | { key: string; error: string };

export function PackCheckout({ pack, locale }: Props) {
  const [appliedPromo, setAppliedPromo] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [cached, setCached] = useState<CachedIntent | null>(null);

  const requestKey = `${pack}|${locale}|${appliedPromo ?? ''}|${reloadKey}`;

  useEffect(() => {
    const ac = new AbortController();
    fetch('/api/billing/create-pack-intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pack, locale, promoCode: appliedPromo ?? undefined }),
      signal: ac.signal,
    })
      .then(async (res) => {
        const data = await res.json();
        if (ac.signal.aborted) return;
        if (!res.ok || !data.clientSecret) {
          if (appliedPromo && res.status === 400 && data.error === 'Invalid promo code') {
            setAppliedPromo(null);
            setPromoError('Code promo invalide ou expiré.');
            return;
          }
          setCached({ key: requestKey, error: data.error ?? 'Init failed' });
          return;
        }
        setPromoError(null);
        setCached({
          key: requestKey,
          data: {
            clientSecret: data.clientSecret,
            amount: data.amount,
            baseAmount: data.baseAmount,
            discountAmount: data.discountAmount,
            promoCode: data.promoCode,
          },
        });
      })
      .catch((e: unknown) => {
        if (ac.signal.aborted) return;
        const msg = e instanceof Error ? e.message : 'Network error';
        setCached({ key: requestKey, error: msg });
      });
    return () => ac.abort();
  }, [pack, locale, appliedPromo, requestKey]);

  // Treat any cached result for a stale key as "still loading".
  const isCurrent = cached?.key === requestKey;
  if (!isCurrent) {
    return <CheckoutSkeleton />;
  }

  if ('error' in cached) {
    return (
      <div style={{ padding: 20, borderRadius: 14, background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', fontSize: 14 }}>
        {cached.error}
        <button
          onClick={() => setReloadKey((k) => k + 1)}
          style={{
            display: 'block', marginTop: 10, padding: '8px 12px', borderRadius: 8,
            background: '#fff', border: '1px solid #fecaca', color: '#dc2626',
            fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}
        >
          Réessayer
        </button>
      </div>
    );
  }

  const { data } = cached;
  const options: StripeElementsOptions = {
    clientSecret: data.clientSecret,
    appearance: {
      theme: 'stripe',
      variables: {
        colorPrimary: '#E57A97',
        colorBackground: '#ffffff',
        colorText: '#0f1020',
        colorDanger: '#dc2626',
        borderRadius: '12px',
        fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif',
        spacingUnit: '4px',
      },
      rules: {
        '.Input': { border: '1px solid #e6e6f0', boxShadow: 'none', padding: '12px' },
        '.Input:focus': { border: '1px solid #E57A97', boxShadow: '0 0 0 3px rgba(229,122,151,0.18)' },
        '.Label': { fontWeight: '600', fontSize: '13px', color: '#3a3b4f' },
        '.Tab': { border: '1px solid #e6e6f0', boxShadow: 'none' },
        '.Tab--selected': { borderColor: '#E57A97', boxShadow: '0 0 0 1px #E57A97' },
      },
    },
  };

  return (
    <Elements stripe={getStripe()} options={options} key={data.clientSecret}>
      <InnerCheckout
        pack={pack}
        locale={locale}
        amount={data.amount}
        baseAmount={data.baseAmount}
        discountAmount={data.discountAmount}
        promoCode={data.promoCode}
        promoError={promoError}
        onApplyPromo={(code) => { setPromoError(null); setAppliedPromo(code); }}
      />
    </Elements>
  );
}

interface InnerProps {
  pack: Pack;
  locale: string;
  amount: number;
  baseAmount: number;
  discountAmount: number;
  promoCode: string | null;
  promoError: string | null;
  onApplyPromo: (code: string | null) => void;
}

function InnerCheckout({
  pack,
  locale,
  amount,
  baseAmount,
  discountAmount,
  promoCode,
  promoError,
  onApplyPromo,
}: InnerProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [promoInput, setPromoInput] = useState(promoCode ?? '');

  const fmt = useMemo(
    () =>
      new Intl.NumberFormat(locale === 'fr' ? 'fr-FR' : 'en-US', {
        style: 'currency',
        currency: 'EUR',
        minimumFractionDigits: 2,
      }),
    [locale]
  );

  async function handleConfirm() {
    if (!stripe || !elements) return;
    setError(null);
    setIsLoading(true);
    try {
      const { error: confirmErr } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/${locale}/order/success`,
          receipt_email: email.trim() || undefined,
        },
      });
      if (confirmErr) {
        setError(confirmErr.message ?? 'Le paiement a échoué.');
      }
    } finally {
      setIsLoading(false);
    }
  }

  function handleApplyPromo() {
    const v = promoInput.trim().toUpperCase();
    onApplyPromo(v || null);
  }

  const isPromoApplied = !!promoCode && promoCode === promoInput.trim().toUpperCase();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {error && (
        <div style={{
          padding: '12px 14px', borderRadius: 10, background: '#fef2f2',
          border: '1px solid #fecaca', color: '#dc2626', fontSize: 13,
        }}>
          {error}
        </div>
      )}

      {/* Express checkout (Apple/Google Pay/Link) */}
      <div>
        <ExpressCheckoutElement
          onConfirm={handleConfirm}
          options={{
            buttonHeight: 48,
            buttonType: { applePay: 'buy', googlePay: 'buy' },
            buttonTheme: { applePay: 'black', googlePay: 'black' },
            layout: { maxColumns: 2, maxRows: 1 },
          }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '16px 0 0' }}>
          <div style={{ flex: 1, height: 1, background: '#e6e6f0' }} />
          <span style={{ fontSize: 11, color: '#6b6d85', fontWeight: 600, letterSpacing: '0.04em' }}>
            OU PAYER PAR CARTE
          </span>
          <div style={{ flex: 1, height: 1, background: '#e6e6f0' }} />
        </div>
      </div>

      {/* Contact email (Link-aware) */}
      <div>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#3a3b4f', marginBottom: 6 }}>
          Email
        </label>
        <LinkAuthenticationElement
          options={{ defaultValues: { email } }}
          onChange={(e) => setEmail(e.value.email)}
        />
      </div>

      {/* Shipping address */}
      <div>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#3a3b4f', marginBottom: 6 }}>
          Adresse de livraison
        </label>
        <AddressElement
          options={{
            mode: 'shipping',
            allowedCountries: ALLOWED_SHIPPING_COUNTRIES,
            fields: { phone: 'auto' },
            validation: { phone: { required: 'auto' } },
            display: { name: 'split' },
          }}
        />
      </div>

      {/* Payment element */}
      <div>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#3a3b4f', marginBottom: 6 }}>
          Paiement
        </label>
        <PaymentElement options={{ layout: 'tabs' }} />
      </div>

      {/* Promo code */}
      <div style={{ borderTop: '1px dashed #e6e6f0', paddingTop: 14 }}>
        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#6b6d85', marginBottom: 6 }}>
          Code promo (optionnel)
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={promoInput}
            onChange={(e) => setPromoInput(e.target.value)}
            placeholder="DIGITIP10"
            style={{
              flex: 1, padding: '10px 12px', borderRadius: 10,
              border: '1px solid #e6e6f0', fontSize: 14, color: '#0f1020',
              background: '#fafafa', outline: 'none', textTransform: 'uppercase',
              fontFamily: 'inherit',
            }}
          />
          <button
            type="button"
            onClick={handleApplyPromo}
            disabled={isLoading}
            style={{
              padding: '10px 16px', borderRadius: 10, cursor: 'pointer',
              background: isPromoApplied ? '#0ea36b' : '#fff',
              border: `1px solid ${isPromoApplied ? '#0ea36b' : '#E57A97'}`,
              color: isPromoApplied ? '#fff' : '#E57A97',
              fontSize: 13, fontWeight: 700,
            }}
          >
            {isPromoApplied ? '✓ Appliqué' : 'Appliquer'}
          </button>
        </div>
        {promoError && (
          <p style={{ marginTop: 6, fontSize: 12, color: '#dc2626' }}>{promoError}</p>
        )}
        {promoCode && (
          <p style={{ marginTop: 6, fontSize: 12, color: '#0ea36b', fontWeight: 600 }}>
            Économie de {fmt.format(discountAmount / 100)} grâce au code « {promoCode} »
          </p>
        )}
      </div>

      {/* Totals */}
      <div style={{
        background: '#FEF1F4', border: '1px solid #FBDAE3', borderRadius: 14,
        padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 6,
      }}>
        <Row label="Sous-total" value={fmt.format(baseAmount / 100)} />
        {discountAmount > 0 && (
          <Row label="Remise" value={`- ${fmt.format(discountAmount / 100)}`} accent="#0ea36b" />
        )}
        <Row label="Livraison" value="Offerte" muted />
        <div style={{ height: 1, background: '#FBDAE3', margin: '4px 0' }} />
        <Row label="Total" value={fmt.format(amount / 100)} bold />
      </div>

      {/* Pay button */}
      <button
        type="button"
        onClick={handleConfirm}
        disabled={!stripe || !elements || isLoading}
        style={{
          width: '100%', padding: '16px', borderRadius: 14, border: 'none',
          background: isLoading ? '#F2B3C4' : '#E57A97', color: '#fff',
          fontSize: 16, fontWeight: 800, letterSpacing: '-0.01em',
          cursor: isLoading ? 'not-allowed' : 'pointer',
          boxShadow: '0 6px 24px rgba(229,122,151,0.35)',
          transition: 'all 130ms',
        }}
      >
        {isLoading ? 'Traitement…' : `Payer ${fmt.format(amount / 100)}`}
      </button>

      <p style={{ fontSize: 11, color: '#6b6d85', textAlign: 'center', lineHeight: 1.5, margin: 0 }}>
        Paiement sécurisé par Stripe. En confirmant, vous acceptez nos CGV.
        {pack === 'duo' ? ' Pack Duo — 2 plaques NFC.' : ' Pack Solo — 1 plaque NFC.'}
      </p>
    </div>
  );
}

function Row({
  label,
  value,
  bold,
  muted,
  accent,
}: {
  label: string;
  value: string;
  bold?: boolean;
  muted?: boolean;
  accent?: string;
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontSize: bold ? 15 : 13, color: muted ? '#6b6d85' : '#3a3b4f', fontWeight: bold ? 800 : 500 }}>
        {label}
      </span>
      <span style={{
        fontSize: bold ? 19 : 14, fontWeight: bold ? 900 : 600,
        color: accent ?? '#0f1020',
        letterSpacing: bold ? '-0.02em' : 'normal',
      }}>
        {value}
      </span>
    </div>
  );
}

function CheckoutSkeleton() {
  const block: React.CSSProperties = {
    background: 'linear-gradient(90deg, #f1f1f4 0%, #e8e8ed 50%, #f1f1f4 100%)',
    backgroundSize: '200% 100%',
    animation: 'shimmer 1.4s ease-in-out infinite',
    borderRadius: 10,
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <style>{`@keyframes shimmer { 0% {background-position: 200% 0;} 100% {background-position: -200% 0;} }`}</style>
      <div style={{ ...block, height: 48 }} />
      <div style={{ ...block, height: 56 }} />
      <div style={{ ...block, height: 120 }} />
      <div style={{ ...block, height: 180 }} />
      <div style={{ ...block, height: 56 }} />
    </div>
  );
}
