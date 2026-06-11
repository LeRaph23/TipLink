'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { loadStripe, type Stripe, type StripeElementsOptions } from '@stripe/stripe-js';
import {
  AddressElement,
  Elements,
  ExpressCheckoutElement,
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

// VAT breakdown returned by /api/billing/pack-tax (all cents).
type Tax = { ht: number; tax: number; total: number; ratePct: number | null };

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
        fontFamily: 'Plus Jakarta Sans, system-ui, sans-serif',
        spacingUnit: '4px',
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
        clientSecret={data.clientSecret}
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
  clientSecret: string;
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
  clientSecret,
  onApplyPromo,
}: InnerProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [promoInput, setPromoInput] = useState(promoCode ?? '');

  // Pack prices are stored excl. VAT (HT). VAT is resolved server-side from
  // the shipping country (Stripe Tax) and the PaymentIntent amount is updated
  // to HT + VAT before the customer can pay.
  const [tax, setTax] = useState<Tax | null>(null);
  const [taxLoading, setTaxLoading] = useState(false);
  const taxKeyRef = useRef<string>('');

  const fmt = useMemo(
    () =>
      new Intl.NumberFormat(locale === 'fr' ? 'fr-FR' : 'en-US', {
        style: 'currency',
        currency: 'EUR',
        minimumFractionDigits: 2,
      }),
    [locale]
  );

  // Calls /api/billing/pack-tax, which recomputes VAT and updates the PI amount.
  const fetchTax = useCallback(
    async (country: string, postalCode?: string | null): Promise<Tax> => {
      const res = await fetch('/api/billing/pack-tax', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientSecret, country, postalCode: postalCode ?? undefined }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? 'Échec du calcul de la TVA');
      return { ht: d.htAmount, tax: d.taxAmount, total: d.totalAmount, ratePct: d.taxRatePercent };
    },
    [clientSecret]
  );

  // Card flow — recompute when the shipping country/postcode changes.
  type AddressChange = {
    complete: boolean;
    value: { address: { country?: string; postal_code?: string } };
  };
  const onAddressChange = useCallback(
    (event: AddressChange) => {
      const addr = event.value?.address;
      if (!addr?.country) return;
      const key = `${addr.country}|${addr.postal_code ?? ''}`;
      if (key === taxKeyRef.current) return;
      taxKeyRef.current = key;
      setTaxLoading(true);
      setError(null);
      fetchTax(addr.country, addr.postal_code)
        .then(setTax)
        .catch(() => { taxKeyRef.current = ''; setTax(null); })
        .finally(() => setTaxLoading(false));
    },
    [fetchTax]
  );

  // Wallet flow (Apple/Google Pay) — recompute when the customer picks an
  // address in the payment sheet, and feed the updated lines back to Stripe.
  type ShippingChange = {
    address: { country?: string; postal_code?: string; postalCode?: string };
    resolve: (d?: { lineItems?: Array<{ name: string; amount: number }> }) => void;
    reject: () => void;
  };
  const onShippingAddressChange = useCallback(
    async (event: ShippingChange) => {
      try {
        const country = event.address?.country ?? '';
        const postal = event.address?.postal_code ?? event.address?.postalCode ?? null;
        if (!country) { event.reject(); return; }
        const t = await fetchTax(country, postal);
        setTax(t);
        taxKeyRef.current = `${country}|${postal ?? ''}`;
        event.resolve({
          lineItems: [
            { name: pack === 'duo' ? 'Pack Duo (HT)' : 'Pack Solo (HT)', amount: t.ht },
            { name: `TVA${t.ratePct != null ? ` (${t.ratePct}%)` : ''}`, amount: t.tax },
          ],
        });
      } catch {
        event.reject();
      }
    },
    [fetchTax, pack]
  );

  type ExpressConfirmEvent = {
    billingDetails?: { email?: string | null; name?: string | null } | null;
    shippingAddress?: {
      name?: string | null;
      address?: { line1?: string | null; line2?: string | null; city?: string | null; postal_code?: string | null; state?: string | null; country?: string | null } | null;
    } | null;
  };

  // We deliberately DO NOT pass receipt_email to confirmPayment — that would
  // trigger Stripe's own branded receipt email, duplicating the Digitip one.
  // The webhook reads metadata.customer_email (set via attach-pi-email).
  async function handleConfirm(event?: ExpressConfirmEvent) {
    if (!stripe || !elements) return;
    const expressEmail = event?.billingDetails?.email ?? null;
    const finalEmail = (expressEmail ?? email).trim();
    if (!finalEmail) {
      setError('Merci d’entrer un email — il est obligatoire pour recevoir la facture et le lien de configuration.');
      return;
    }
    if (!tax) {
      setError('Renseignez votre adresse de livraison pour calculer la TVA.');
      return;
    }
    setError(null);
    setIsLoading(true);
    try {
      await fetch('/api/billing/attach-pi-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientSecret, email: finalEmail }),
      }).catch(() => {});

      const shipping = event?.shippingAddress?.address
        ? {
            name: (event.shippingAddress.name ?? '').trim() || finalEmail,
            address: {
              line1: event.shippingAddress.address.line1 ?? '',
              line2: event.shippingAddress.address.line2 ?? undefined,
              city: event.shippingAddress.address.city ?? '',
              postal_code: event.shippingAddress.address.postal_code ?? '',
              state: event.shippingAddress.address.state ?? undefined,
              country: event.shippingAddress.address.country ?? '',
            },
          }
        : undefined;
      const { error: confirmErr } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/${locale}/order/success`,
          ...(shipping ? { shipping } : {}),
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
  const displayTotal = tax ? tax.total : amount;
  const canPay = !!tax && !taxLoading;

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
          onShippingAddressChange={onShippingAddressChange}
          options={{
            buttonHeight: 48,
            buttonType: { applePay: 'buy', googlePay: 'buy' },
            buttonTheme: { applePay: 'black', googlePay: 'black' },
            layout: { maxColumns: 2, maxRows: 1 },
            emailRequired: true,
            shippingAddressRequired: true,
            allowedShippingCountries: [...ALLOWED_SHIPPING_COUNTRIES],
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

      {/* Contact email */}
      <div>
        <label
          htmlFor="checkout-email"
          style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#3a3b4f', marginBottom: 6 }}
        >
          Email
        </label>
        <input
          id="checkout-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="email@exemple.com"
          required
          style={{
            width: '100%', padding: '12px', borderRadius: 10,
            border: '1px solid #e6e6f0', fontSize: 14, color: '#0f1020',
            background: '#fff', outline: 'none',
            fontFamily: 'inherit', boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Shipping address — drives the VAT calculation */}
      <div>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#3a3b4f', marginBottom: 6 }}>
          Adresse de livraison
        </label>
        <AddressElement
          options={{
            mode: 'shipping',
            allowedCountries: ALLOWED_SHIPPING_COUNTRIES,
            fields: { phone: 'always' },
            validation: { phone: { required: 'auto' } },
          }}
          onChange={onAddressChange}
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

      {/* Totals — prices are HT, VAT is added per the shipping country */}
      <div style={{
        background: '#FEF1F4', border: '1px solid #FBDAE3', borderRadius: 14,
        padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 6,
      }}>
        <Row label="Sous-total HT" value={fmt.format(baseAmount / 100)} />
        {discountAmount > 0 && (
          <Row label="Remise" value={`- ${fmt.format(discountAmount / 100)}`} accent="#0ea36b" />
        )}
        <Row
          label={tax?.ratePct != null ? `TVA (${tax.ratePct}%)` : 'TVA'}
          value={tax ? fmt.format(tax.tax / 100) : (taxLoading ? 'Calcul…' : 'Selon l’adresse')}
          muted={!tax}
        />
        <Row label="Livraison" value="Offerte" muted />
        <div style={{ height: 1, background: '#FBDAE3', margin: '4px 0' }} />
        <Row label="Total TTC" value={tax ? fmt.format(tax.total / 100) : '—'} bold />
      </div>

      {/* Pay button */}
      <button
        type="button"
        onClick={() => { void handleConfirm(); }}
        disabled={!stripe || !elements || isLoading || !canPay}
        style={{
          width: '100%', padding: '16px', borderRadius: 14, border: 'none',
          background: !stripe || !elements || isLoading || !canPay ? '#E9C6D0' : '#E57A97',
          color: '#fff',
          fontSize: 16, fontWeight: 800, letterSpacing: '-0.01em',
          opacity: !stripe || !elements || isLoading || !canPay ? 0.7 : 1,
          cursor: !stripe || !elements || isLoading || !canPay ? 'not-allowed' : 'pointer',
          boxShadow: !stripe || !elements || isLoading || !canPay ? 'none' : '0 6px 24px rgba(229,122,151,0.35)',
          transition: 'all 130ms',
        }}
      >
        {isLoading
          ? 'Traitement…'
          : taxLoading
            ? 'Calcul de la TVA…'
            : tax
              ? `Payer ${fmt.format(displayTotal / 100)}`
              : 'Renseignez votre adresse de livraison'}
      </button>

      <p style={{ fontSize: 11, color: '#6b6d85', textAlign: 'center', lineHeight: 1.5, margin: 0 }}>
        Paiement sécurisé par Stripe. TVA calculée selon votre pays de livraison.
        En confirmant, vous acceptez nos CGV.
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
