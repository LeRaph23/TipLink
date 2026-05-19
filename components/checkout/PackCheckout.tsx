'use client';

import { useEffect, useMemo, useState } from 'react';
import { MangopayCheckout } from '@/components/payment/MangopayCheckout';

type Pack = 'solo' | 'duo';

interface Props {
  pack: Pack;
  locale: string;
}

const SHIPPING_COUNTRIES = ['FR', 'BE', 'IE', 'ES', 'DE', 'IT', 'NL', 'LU', 'PT', 'AT', 'FI', 'GR'];

type Quote = {
  baseAmount: number;
  discountAmount: number;
  htAmount: number;
  taxAmount: number;
  totalAmount: number;
  taxRatePercent: number | null;
  promoCode: string | null;
};

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '12px', borderRadius: 10,
  border: '1px solid #e6e6f0', fontSize: 14, color: '#0f1020',
  background: '#fff', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
};

// Express SmartTag pack purchase. Mangopay's Checkout SDK collects only the
// card, so the shipping address + email are gathered in-app here; the VAT
// quote is recomputed server-side and the card form mounts once the address
// is complete.
export function PackCheckout({ pack, locale }: Props) {
  const isFr = locale === 'fr';
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [line1, setLine1] = useState('');
  const [line2, setLine2] = useState('');
  const [city, setCity] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [country, setCountry] = useState('FR');
  const [promoInput, setPromoInput] = useState('');
  const [appliedPromo, setAppliedPromo] = useState<string | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [nonce] = useState(() =>
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random()}`
  );

  const fmt = useMemo(
    () => new Intl.NumberFormat(isFr ? 'fr-FR' : 'en-US', {
      style: 'currency', currency: 'EUR', minimumFractionDigits: 2,
    }),
    [isFr]
  );

  // Recompute the price breakdown whenever pack, country or promo change.
  useEffect(() => {
    const ac = new AbortController();
    fetch('/api/billing/pack-tax', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pack, country, promoCode: appliedPromo ?? undefined }),
      signal: ac.signal,
    })
      .then((res) => res.json())
      .then((d) => {
        if (ac.signal.aborted) return;
        setQuote(d as Quote);
      })
      .catch(() => { if (!ac.signal.aborted) setQuote(null); });
    return () => ac.abort();
  }, [pack, country, appliedPromo]);

  const addressComplete =
    !!name.trim() && !!line1.trim() && !!city.trim() && !!postalCode.trim() && !!email.trim();

  const paymentContext = {
    pack,
    locale,
    nonce,
    promoCode: appliedPromo ?? undefined,
    customerEmail: email.trim() || undefined,
    shipping: {
      name: name.trim(),
      line1: line1.trim(),
      line2: line2.trim() || undefined,
      city: city.trim(),
      postal_code: postalCode.trim(),
      country,
    },
  };

  function handleSuccess(payIn: { Id: string }) {
    window.location.href = `/${locale}/order/success?payin=${encodeURIComponent(payIn.Id)}`;
  }

  const total = quote?.totalAmount ?? null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {error && (
        <div style={{ padding: '12px 14px', borderRadius: 10, background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', fontSize: 13 }}>
          {error}
        </div>
      )}

      <Field label="Email">
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@exemple.com" style={inputStyle} />
      </Field>

      <Field label={isFr ? 'Adresse de livraison' : 'Shipping address'}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={isFr ? 'Nom complet' : 'Full name'} style={inputStyle} />
          <input value={line1} onChange={(e) => setLine1(e.target.value)} placeholder={isFr ? 'Adresse' : 'Address'} style={inputStyle} />
          <input value={line2} onChange={(e) => setLine2(e.target.value)} placeholder={isFr ? 'Complément (optionnel)' : 'Address line 2 (optional)'} style={inputStyle} />
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={postalCode} onChange={(e) => setPostalCode(e.target.value)} placeholder={isFr ? 'Code postal' : 'Postal code'} style={{ ...inputStyle, flex: 1 }} />
            <input value={city} onChange={(e) => setCity(e.target.value)} placeholder={isFr ? 'Ville' : 'City'} style={{ ...inputStyle, flex: 2 }} />
          </div>
          <select value={country} onChange={(e) => setCountry(e.target.value)} style={inputStyle}>
            {SHIPPING_COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </Field>

      {/* Promo code */}
      <div style={{ borderTop: '1px dashed #e6e6f0', paddingTop: 14 }}>
        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#6b6d85', marginBottom: 6 }}>
          {isFr ? 'Code promo (optionnel)' : 'Promo code (optional)'}
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={promoInput}
            onChange={(e) => setPromoInput(e.target.value)}
            placeholder="DIGITIP10"
            style={{ ...inputStyle, flex: 1, textTransform: 'uppercase', background: '#fafafa' }}
          />
          <button
            type="button"
            onClick={() => setAppliedPromo(promoInput.trim().toUpperCase() || null)}
            style={{
              padding: '10px 16px', borderRadius: 10, cursor: 'pointer',
              background: quote?.promoCode ? '#0ea36b' : '#fff',
              border: `1px solid ${quote?.promoCode ? '#0ea36b' : '#E57A97'}`,
              color: quote?.promoCode ? '#fff' : '#E57A97', fontSize: 13, fontWeight: 700,
            }}
          >
            {quote?.promoCode ? '✓' : (isFr ? 'Appliquer' : 'Apply')}
          </button>
        </div>
      </div>

      {/* Totals */}
      {quote && (
        <div style={{ background: '#FEF1F4', border: '1px solid #FBDAE3', borderRadius: 14, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <Row label={isFr ? 'Sous-total HT' : 'Subtotal excl. VAT'} value={fmt.format(quote.baseAmount / 100)} />
          {quote.discountAmount > 0 && (
            <Row label={isFr ? 'Remise' : 'Discount'} value={`- ${fmt.format(quote.discountAmount / 100)}`} accent="#0ea36b" />
          )}
          <Row label={quote.taxRatePercent != null ? `TVA (${quote.taxRatePercent}%)` : 'TVA'} value={fmt.format(quote.taxAmount / 100)} />
          <div style={{ height: 1, background: '#FBDAE3', margin: '4px 0' }} />
          <Row label={isFr ? 'Total TTC' : 'Total incl. VAT'} value={fmt.format(quote.totalAmount / 100)} bold />
        </div>
      )}

      {/* Card form — mounts once the address is complete */}
      {addressComplete && total != null ? (
        <MangopayCheckout
          amount={total}
          currency="EUR"
          createPaymentUrl="/api/billing/create-pack-intent"
          paymentContext={paymentContext}
          onSuccess={handleSuccess}
          onError={setError}
        />
      ) : (
        <p style={{ fontSize: 13, color: '#6b6d85', textAlign: 'center', margin: 0 }}>
          {isFr
            ? 'Renseignez votre email et votre adresse pour payer.'
            : 'Enter your email and address to pay.'}
        </p>
      )}

      <p style={{ fontSize: 11, color: '#6b6d85', textAlign: 'center', lineHeight: 1.5, margin: 0 }}>
        {isFr ? 'Paiement sécurisé par Mangopay. TVA calculée selon le pays de livraison.' : 'Secure payment by Mangopay. VAT computed from the shipping country.'}
        {pack === 'duo' ? ' Pack Duo — 2 plaques NFC.' : ' Pack Solo — 1 plaque NFC.'}
      </p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#3a3b4f', marginBottom: 6 }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function Row({ label, value, bold, accent }: { label: string; value: string; bold?: boolean; accent?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontSize: bold ? 15 : 13, color: '#3a3b4f', fontWeight: bold ? 800 : 500 }}>{label}</span>
      <span style={{ fontSize: bold ? 19 : 14, fontWeight: bold ? 900 : 600, color: accent ?? '#0f1020' }}>{value}</span>
    </div>
  );
}
