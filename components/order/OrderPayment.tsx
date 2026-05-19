'use client';

import { useMemo, useState } from 'react';
import { MangopayCheckout } from '@/components/payment/MangopayCheckout';

type Address = {
  line1: string;
  line2?: string | null;
  city: string;
  postal_code: string;
  country: string;
};

export type OrderBusiness = {
  legal_name: string;
  vat_number?: string | null;
  shipping: Address;
  billing_same_as_shipping?: boolean;
  billing?: Address;
};

export type OrderPaymentProps = {
  locale: string;
  pack: 'solo' | 'duo';
  promoCode: string | null;
  business: OrderBusiness;
  htAmount: number;
  taxAmount: number;
  totalAmount: number;
  taxRatePercent: number | null;
};

// In-page payment for the /order wizard. The business details collected by
// the wizard are sent with the card to /api/billing/checkout, which finds or
// creates the billing group and creates the pack PayIn.
export function OrderPayment({
  locale,
  pack,
  promoCode,
  business,
  htAmount,
  taxAmount,
  totalAmount,
  taxRatePercent,
}: OrderPaymentProps) {
  const isFr = locale === 'fr';
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

  const paymentContext = {
    pack,
    locale,
    nonce,
    promoCode: promoCode ?? undefined,
    business,
  };

  function handleSuccess(payIn: { Id: string }) {
    window.location.href = `/${locale}/order/success?payin=${encodeURIComponent(payIn.Id)}`;
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

      <MangopayCheckout
        amount={totalAmount}
        currency="EUR"
        createPaymentUrl="/api/billing/checkout"
        paymentContext={paymentContext}
        onSuccess={handleSuccess}
        onError={setError}
      />

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

      <p style={{ fontSize: 11, color: 'var(--text-3)', textAlign: 'center', margin: 0 }}>
        {isFr ? 'Paiement sécurisé et chiffré par Mangopay.' : 'Secure, encrypted payment by Mangopay.'}
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
