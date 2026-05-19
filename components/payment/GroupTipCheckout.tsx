'use client';

import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { MangopayCheckout } from './MangopayCheckout';

interface Props {
  establishmentId: string;
  amount: number;
  tipAmount: number;
  currency: string;
  staffCount: number;
}

export function GroupTipCheckout({ establishmentId, amount, tipAmount, currency, staffCount }: Props) {
  const t = useTranslations('pay');
  const locale = useLocale();
  const [error, setError] = useState<string | null>(null);
  const [customerEmail, setCustomerEmail] = useState('');

  const [nonce] = useState(() =>
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random()}`
  );

  const paymentContext = {
    establishmentId,
    amount,
    tipAmount,
    currency,
    nonce,
    customerEmail: customerEmail.trim() || undefined,
  };

  function handleSuccess(payIn: { Id: string }) {
    window.location.href = `/${locale}/pay/success?payin=${encodeURIComponent(payIn.Id)}`;
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

      <MangopayCheckout
        amount={amount}
        currency={currency}
        createPaymentUrl="/api/mangopay/create-group-payin"
        paymentContext={paymentContext}
        onSuccess={handleSuccess}
        onError={setError}
      />

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
