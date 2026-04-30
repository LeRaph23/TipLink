'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { TipCheckout } from './TipCheckout';

const SERVICE_FEE_CENTS = 25;

interface Props {
  staffId: string;
  currency: string;
  thresholds: number[];
}

export function AmountSelector({ staffId, currency, thresholds }: Props) {
  const t = useTranslations('pay');
  const [selectedAmount, setSelectedAmount] = useState<number | null>(null);
  const [custom, setCustom] = useState('');
  const [customFocus, setCustomFocus] = useState(false);

  const tipAmount = custom
    ? Math.round((parseFloat(custom) || 0) * 100)
    : selectedAmount;

  const hasAmount = tipAmount !== null && tipAmount >= 50;

  const fmt = new Intl.NumberFormat(undefined, {
    style: 'currency', currency, minimumFractionDigits: 0,
  });
  const fmtCents = new Intl.NumberFormat(undefined, {
    style: 'currency', currency, minimumFractionDigits: 2,
  });

  return (
    <>
      {/* Amount selector card */}
      <div style={{
        padding: 20, borderRadius: 20, marginBottom: 12,
        background: 'var(--surface)', border: '1px solid var(--border-subtle)',
      }}>
        <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.09em', textAlign: 'center', marginBottom: 12 }}>
          {t('selectAmount')}
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 12 }}>
          {thresholds.map(amt => {
            const cents = amt * 100;
            const active = !custom && selectedAmount === cents;

            return (
              <button
                key={amt}
                onClick={() => { setSelectedAmount(cents); setCustom(''); }}
                style={{
                  padding: '14px 6px', borderRadius: 12,
                  border: `2px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                  background: active ? 'var(--accent-muted)' : 'var(--surface-2)',
                  color: active ? 'var(--accent)' : 'var(--text)',
                  fontFamily: 'var(--font)', fontSize: 20, fontWeight: 800, cursor: 'pointer',
                  letterSpacing: '-0.03em',
                  boxShadow: active ? '0 0 0 3px var(--accent-muted)' : 'none',
                  transition: 'all 130ms cubic-bezier(.34,1.3,.64,1)',
                  transform: active ? 'scale(1.05)' : 'scale(1)',
                }}
              >
                {fmt.format(amt)}
              </button>
            );
          })}
        </div>
        {/* Custom amount */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <span style={{ position: 'absolute', left: 11, fontSize: 14, color: 'var(--text-3)', pointerEvents: 'none', zIndex: 1 }}>
            {currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : '$'}
          </span>
          <input
            type="number" placeholder={t('customAmount')} value={custom}
            onChange={e => { setCustom(e.target.value); setSelectedAmount(null); }}
            onFocus={() => setCustomFocus(true)} onBlur={() => setCustomFocus(false)}
            style={{
              width: '100%', background: 'var(--surface-2)',
              border: `1.5px solid ${customFocus ? 'var(--accent)' : 'var(--border)'}`,
              borderRadius: 'var(--radius-sm)', padding: '9px 12px 9px 28px',
              color: 'var(--text)', fontSize: 13.5, outline: 'none',
              boxShadow: customFocus ? '0 0 0 3px var(--accent-muted)' : 'none',
              fontFamily: 'var(--font)',
            }}
          />
        </div>
      </div>

      {/* Service fee breakdown — shown once a valid tip is selected */}
      {hasAmount && tipAmount && (
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '10px 14px', borderRadius: 10,
          background: 'var(--surface-2)', border: '1px solid var(--border-subtle)',
          fontSize: 12.5, color: 'var(--text-3)', marginBottom: 0,
        }}>
          <span>{fmt.format(tipAmount / 100)} pourboire + {fmtCents.format(SERVICE_FEE_CENTS / 100)} frais de service</span>
          <span style={{ fontWeight: 700, color: 'var(--text)', fontSize: 13 }}>
            = {fmtCents.format((tipAmount + SERVICE_FEE_CENTS) / 100)}
          </span>
        </div>
      )}

      {/* Checkout card — only shown once a valid amount is chosen.
          Remounting via `key={tipAmount}` forces Stripe Elements to
          recompute payment methods for the new total charge amount. */}
      {hasAmount && tipAmount && (
        <TipCheckout
          key={tipAmount}
          staffId={staffId}
          tipAmount={tipAmount}
          amount={tipAmount + SERVICE_FEE_CENTS}
          currency={currency}
        />
      )}

      {!hasAmount && (
        <div style={{
          padding: 20, borderRadius: 20,
          background: 'var(--surface)', border: '1px solid var(--border-subtle)',
          textAlign: 'center', color: 'var(--text-3)', fontSize: 13,
        }}>
          {t('selectAmountPrompt')}
        </div>
      )}
    </>
  );
}
