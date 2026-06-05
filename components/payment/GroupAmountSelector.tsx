'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { GroupTipCheckout } from './GroupTipCheckout';
import { CheckoutErrorBoundary } from './CheckoutErrorBoundary';

const SERVICE_FEE_CENTS = 25;

interface Props {
  establishmentId: string;
  currency: string;
  thresholds: number[];
  staffCount: number;
}

export function GroupAmountSelector({ establishmentId, currency, thresholds, staffCount }: Props) {
  const t = useTranslations('pay');
  const cur = (currency || 'EUR').toUpperCase();
  // 5 is pre-selected by default (falls back to the first preset).
  const [selectedAmount, setSelectedAmount] = useState<number | null>(() => {
    const pref = thresholds.includes(5) ? 5 : thresholds[0];
    return pref ? pref * 100 : null;
  });
  const [custom, setCustom] = useState('');
  const [customFocus, setCustomFocus] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const [showFeeInfo, setShowFeeInfo] = useState(false);

  const tipAmount = custom
    ? Math.round((parseFloat(custom) || 0) * 100)
    : selectedAmount;

  const hasAmount = tipAmount !== null && tipAmount >= 50;

  const currencySymbol = cur === 'EUR' ? '€' : cur === 'GBP' ? '£' : cur === 'USD' ? '$' : '';
  const fmt = new Intl.NumberFormat(undefined, {
    style: 'currency', currency: cur, minimumFractionDigits: 0,
  });
  const fmtCents = new Intl.NumberFormat(undefined, {
    style: 'currency', currency: cur, minimumFractionDigits: 2,
  });

  const perPerson = hasAmount && tipAmount && staffCount > 1
    ? fmtCents.format(tipAmount / 100 / staffCount)
    : null;

  return (
    <>
      {/* Amount selector card */}
      <div style={{
        padding: 20, borderRadius: 20, marginBottom: 12,
        background: 'var(--surface)', border: '1px solid var(--border-subtle)',
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(thresholds.length, 4)}, 1fr)`, gap: 8 }}>
          {thresholds.map(amt => {
            const cents = amt * 100;
            const active = !custom && selectedAmount === cents;

            return (
              <button
                key={amt}
                onClick={() => { setSelectedAmount(cents); setCustom(''); setShowCustom(false); }}
                style={{
                  padding: '16px 6px', borderRadius: 12,
                  border: `2px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                  background: active ? 'var(--accent-muted)' : 'var(--surface-2)',
                  color: active ? 'var(--accent)' : 'var(--text)',
                  fontFamily: 'var(--font)', fontSize: 20, fontWeight: 800, cursor: 'pointer',
                  letterSpacing: '-0.03em',
                  boxShadow: active ? '0 0 0 3px var(--accent-muted)' : 'none',
                  transition: 'all 130ms cubic-bezier(.34,1.3,.64,1)',
                  transform: active ? 'scale(1.04)' : 'scale(1)',
                }}
              >
                {fmt.format(amt)}
              </button>
            );
          })}
        </div>

        {/* Custom amount — a small link that reveals the input on click. */}
        {!showCustom ? (
          <button
            type="button"
            onClick={() => { setShowCustom(true); setSelectedAmount(null); }}
            style={{
              display: 'block', margin: '12px auto 0', background: 'none', border: 'none',
              color: 'var(--text-3)', fontSize: 12.5, cursor: 'pointer', fontFamily: 'var(--font)',
              textDecoration: 'underline', textUnderlineOffset: 3,
            }}
          >
            {t('group.customAmountLabel')}
          </button>
        ) : (
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', marginTop: 12 }}>
            <span style={{ position: 'absolute', left: 11, fontSize: 14, color: 'var(--text-3)', pointerEvents: 'none', zIndex: 1 }}>
              {currencySymbol}
            </span>
            <input
              type="number" inputMode="decimal" placeholder={t('group.customAmountLabel')} value={custom} autoFocus
              onChange={e => { setCustom(e.target.value); setSelectedAmount(null); }}
              onFocus={() => setCustomFocus(true)} onBlur={() => setCustomFocus(false)}
              style={{
                width: '100%', background: 'var(--surface-2)',
                border: `1.5px solid ${customFocus ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: 'var(--radius-sm)', padding: '11px 12px 11px 28px',
                color: 'var(--text)', fontSize: 16, outline: 'none',
                boxShadow: customFocus ? '0 0 0 3px var(--accent-muted)' : 'none',
                fontFamily: 'var(--font)',
              }}
            />
          </div>
        )}
      </div>

      {/* Service fee — single line + a clickable "i" that explains it. */}
      {hasAmount && tipAmount && (
        <div style={{ textAlign: 'center', margin: '-4px 0 0' }}>
          <p style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.5, margin: 0 }}>
            {fmt.format(tipAmount / 100)} pourboire{perPerson ? ` (${perPerson} / pers.)` : ''}&nbsp;+&nbsp;{fmtCents.format(SERVICE_FEE_CENTS / 100)} frais de service{' '}
            <button
              type="button"
              onClick={() => setShowFeeInfo((v) => !v)}
              aria-expanded={showFeeInfo}
              aria-label={t('feeInfo')}
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 16, height: 16, borderRadius: '50%', verticalAlign: 'middle',
                border: '1px solid var(--border)', background: showFeeInfo ? 'var(--accent-muted)' : 'var(--surface-2)',
                color: showFeeInfo ? 'var(--accent)' : 'var(--text-3)', fontSize: 11, fontWeight: 700,
                fontStyle: 'italic', fontFamily: 'Georgia, serif', cursor: 'pointer', lineHeight: 1, padding: 0,
              }}
            >
              i
            </button>
            {' = '}
            <strong style={{ color: 'var(--text-2)', fontWeight: 700 }}>
              {fmtCents.format((tipAmount + SERVICE_FEE_CENTS) / 100)} débités
            </strong>
          </p>
          {showFeeInfo && (
            <p
              className="fade-up"
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 7,
                fontSize: 11.5, color: 'var(--text-2)', lineHeight: 1.55,
                margin: '8px auto 0', maxWidth: 320, textAlign: 'left',
                background: 'var(--surface-2)', border: '1px solid var(--border-subtle)',
                padding: '9px 12px', borderRadius: 10,
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="#E57A97" stroke="none" style={{ flexShrink: 0, marginTop: 1 }} aria-hidden>
                <path d="M12 21s-7.5-4.6-10-9.2C.6 9 1.7 5.5 4.8 4.7 6.7 4.2 8.6 5 9.6 6.4L12 9l2.4-2.6c1-1.4 2.9-2.2 4.8-1.7 3.1.8 4.2 4.3 2.8 7.1C19.5 16.4 12 21 12 21z" />
              </svg>
              <span>{t('feeInfo')}</span>
            </p>
          )}
        </div>
      )}

      {/* Checkout — only shown once a valid amount is chosen. We deliberately
          do NOT remount on amount change (a `key={tipAmount}` made the wallet
          button flicker): Stripe Elements updates the amount in place via the
          changing `options.amount`. */}
      {hasAmount && tipAmount ? (
        <CheckoutErrorBoundary
          fallback={
            <div style={{
              padding: 20, borderRadius: 20, background: 'var(--surface)',
              border: '1px solid var(--border-subtle)', textAlign: 'center',
              color: 'var(--error)', fontSize: 13,
            }}>
              {t('errors.initFailed')}
            </div>
          }
        >
          <GroupTipCheckout
            establishmentId={establishmentId}
            tipAmount={tipAmount}
            amount={tipAmount + SERVICE_FEE_CENTS}
            currency={currency}
          />
        </CheckoutErrorBoundary>
      ) : (
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
