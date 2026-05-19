'use client';

import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { MangopayCheckout } from './MangopayCheckout';

interface Props {
  staffId: string;
  amount: number;    // total charge in cents = tipAmount + service fee
  tipAmount: number; // the tip the customer selected, in cents
  currency: string;
  // When the page reached this checkout via a group/establishment scan, pass
  // the establishment id so the server can refuse cross-establishment tipping.
  expectedEstablishmentId?: string;
}

export function TipCheckout({ staffId, amount, tipAmount, currency, expectedEstablishmentId }: Props) {
  const t = useTranslations('pay');
  const locale = useLocale();
  const [error, setError] = useState<string | null>(null);
  const [customerEmail, setCustomerEmail] = useState('');

  const [nonce] = useState(() =>
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random()}`
  );

  // Captured live by MangopayCheckout — the email typed below is included even
  // though it is entered after the SDK mounts.
  const paymentContext = {
    staffId,
    amount,
    tipAmount,
    currency,
    nonce,
    customerEmail: customerEmail.trim() || undefined,
    ...(expectedEstablishmentId ? { expectedEstablishmentId } : {}),
  };

  function handleSuccess(payIn: { Id: string }) {
    window.location.href = `/${locale}/pay/success?payin=${encodeURIComponent(payIn.Id)}&staff=${encodeURIComponent(staffId)}`;
  }

  return (
    <div style={{
      padding: 20,
      borderRadius: 20,
      background: 'var(--surface)',
      border: '1px solid var(--border-subtle)',
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
    }}>
      {error && (
        <p style={{ fontSize: 12, color: 'var(--error)', textAlign: 'center', margin: 0 }}>
          {error}
        </p>
      )}

      <MangopayCheckout
        amount={amount}
        currency={currency}
        createPaymentUrl="/api/mangopay/create-payin"
        paymentContext={paymentContext}
        onSuccess={handleSuccess}
        onError={setError}
      />

      {/* Email — always visible, clearly optional */}
      <div>
        <label style={{
          display: 'block', fontSize: 12, color: 'var(--text-3)',
          marginBottom: 6, letterSpacing: '0.01em',
        }}>
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
