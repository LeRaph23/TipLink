'use client';

import { useEffect, useRef, useState } from 'react';
import { TIP_MAX_CENTS, TIP_MIN_CENTS } from '@/lib/tips/limits';
import { useTranslations, useLocale } from 'next-intl';
import { TipCheckout } from './TipCheckout';
import { DemoPayButton } from './DemoPayButton';
import { CheckoutErrorBoundary } from './CheckoutErrorBoundary';
import { computeTipFee, computeTipTotal, type TipFeeConfig } from '@/lib/pricing/tip-fees';
import { moneyFormatter } from '@/lib/money';
import { TipSummary } from './TipSummary';

interface Props {
  staffId: string;
  currency: string;
  thresholds: number[];
  expectedEstablishmentId?: string;
  isDemo?: boolean;
  /** Group's service fee config. Omitted falls back to the platform default —
   *  the server recomputes it and rejects a mismatched total either way. */
  feeConfig?: TipFeeConfig;
}

export function AmountSelector({ staffId, currency, thresholds, expectedEstablishmentId, isDemo, feeConfig }: Props) {
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
  // Focus the custom field without scrolling the page: autoFocus jumped the
  // view back to the top on a phone (UX-05).
  const customRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (showCustom) customRef.current?.focus({ preventScroll: true });
  }, [showCustom]);

  const tipAmount = custom
    ? Math.round((parseFloat(custom.replace(',', '.')) || 0) * 100)
    : selectedAmount;

  const tooHigh = tipAmount !== null && tipAmount > TIP_MAX_CENTS;
  const hasAmount = tipAmount !== null && tipAmount >= TIP_MIN_CENTS && !tooHigh;
  // Below the 0.50 minimum, with something actually typed → show an inline hint
  // instead of silently hiding the checkout.
  const customInvalid = custom.trim() !== '' && (tipAmount === null || tipAmount < TIP_MIN_CENTS || tooHigh);

  // The tipper covers the whole cost of the transaction on top of their tip, so
  // the recipient keeps 100 % of what was chosen.
  const serviceFee = computeTipFee(tipAmount ?? 0, feeConfig);
  const totalAmount = computeTipTotal(tipAmount ?? 0, feeConfig);

  const currencySymbol = cur === 'EUR' ? '€' : cur === 'GBP' ? '£' : cur === 'USD' ? '$' : '';
  // The page locale, not the device's: the server rendered "€2" and the
  // browser "2 €", a hydration mismatch on every tip page (sixth QA run).
  const pageLocale = useLocale();
  const fmt = moneyFormatter(pageLocale, cur, 0);
  const fmtCents = moneyFormatter(pageLocale, cur, 2);

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
                type="button"
                // The selected amount was signalled by colour alone: a pink
                // border, a pink background and a 4 % scale. A screen-reader
                // user had no way to know which amount was armed before paying,
                // and neither did anyone reading the screen in bright sunlight.
                // aria-pressed states it outright.
                aria-pressed={active}
                onClick={() => { setSelectedAmount(cents); setCustom(''); setShowCustom(false); }}
                style={{
                  padding: '16px 6px', borderRadius: 12,
                  border: `2px solid ${active ? 'var(--accent-strong)' : 'var(--border)'}`,
                  background: active ? 'var(--accent-muted)' : 'var(--surface-2)',
                  color: 'var(--text)',
                  fontFamily: 'var(--font)', fontSize: 20, fontWeight: 800, cursor: 'pointer',
                  letterSpacing: '-0.03em',
                  boxShadow: active ? '0 0 0 3px var(--accent-muted)' : 'none',
                  transition: 'transform var(--dur-1) var(--ease-spring), border-color var(--dur-1) var(--ease-out), background var(--dur-1) var(--ease-out), color var(--dur-1) var(--ease-out), box-shadow var(--dur-1) var(--ease-out)',
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
            onClick={() => setShowCustom(true)}
            style={{
              display: 'block', margin: '12px auto 0', background: 'none', border: 'none',
              color: 'var(--text-2)', fontSize: 13.5, fontWeight: 600, padding: '10px 14px', cursor: 'pointer', fontFamily: 'var(--font)',
              textDecoration: 'underline', textUnderlineOffset: 3,
            }}
          >
            {t('customAmount')}
          </button>
        ) : (
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', marginTop: 12 }}>
            <span style={{ position: 'absolute', left: 11, fontSize: 14, color: 'var(--text-3)', pointerEvents: 'none', zIndex: 1 }}>
              {currencySymbol}
            </span>
            <input
              type="text" inputMode="decimal" autoComplete="off" placeholder={t('otherAmount')} value={custom} ref={customRef}
              // The field had no label at all, only a placeholder — which
              // disappears the moment anything is typed, leaving a screen
              // reader with an unnamed number box on the payment screen.
              aria-label={t('customAmount')}
              aria-describedby={customInvalid ? 'custom-amount-error' : undefined}
              // At most two decimals: 12,345 € was accepted, then shown as 12,35 €.
              onChange={e => { if (/^\d*([.,]\d{0,2})?$/.test(e.target.value)) { setCustom(e.target.value); } }}
              onFocus={() => setCustomFocus(true)} onBlur={() => setCustomFocus(false)}
              style={{
                width: '100%', background: 'var(--surface-2)',
                border: `1.5px solid ${customInvalid ? 'var(--error)' : customFocus ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: 'var(--radius-sm)', padding: '11px 12px 11px 28px',
                color: 'var(--text)', fontSize: 16, outline: 'none',
                boxShadow: customFocus ? `0 0 0 3px ${customInvalid ? 'color-mix(in oklch, var(--error) 18%, transparent)' : 'var(--accent-muted)'}` : 'none',
                fontFamily: 'var(--font)',
              }}
              aria-invalid={customInvalid}
            />
          </div>
        )}
        {customInvalid && (
          <p
            id="custom-amount-error"
            role="alert"
            style={{ margin: '6px 2px 0', fontSize: 11.5, color: 'var(--error)', fontFamily: 'var(--font)' }}
          >
            {tooHigh
              ? t('maxAmount', { max: fmtCents.format(TIP_MAX_CENTS / 100) })
              : t('minAmount', { min: fmtCents.format(TIP_MIN_CENTS / 100) })}
          </p>
        )}
      </div>

      {hasAmount && tipAmount && (
        <TipSummary
          tip={fmtCents.format(tipAmount / 100)}
          fee={fmtCents.format(serviceFee / 100)}
          total={fmtCents.format(totalAmount / 100)}
          perPerson={null}
        />
      )}

      {/* Checkout — only shown once a valid amount is chosen. We deliberately
          do NOT remount on amount change (a `key={tipAmount}` made the wallet
          button flicker): Stripe Elements updates the amount in place via the
          changing `options.amount`. */}
      {hasAmount && tipAmount && (
        isDemo ? (
          <DemoPayButton
            kind="staff"
            targetId={staffId}
            amount={totalAmount}
            currency={currency}
          />
        ) : (
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
            <TipCheckout
              staffId={staffId}
              tipAmount={tipAmount}
              amount={totalAmount}
              currency={currency}
              expectedEstablishmentId={expectedEstablishmentId}
            />
          </CheckoutErrorBoundary>
        )
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
