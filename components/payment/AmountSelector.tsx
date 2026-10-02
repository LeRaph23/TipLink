'use client';

import { useEffect, useState } from 'react';
import { TIP_MAX_CENTS, TIP_MIN_CENTS } from '@/lib/tips/limits';
import { useTranslations, useLocale } from 'next-intl';
import { TipCheckout } from './TipCheckout';
import { DemoPayButton } from './DemoPayButton';
import { CheckoutErrorBoundary } from './CheckoutErrorBoundary';
import { computeTipFee, computeTipTotal, type TipFeeConfig } from '@/lib/pricing/tip-fees';
import { moneyFormatter } from '@/lib/money';
import { PayError } from '@/components/pay/ui';
import { AmountTiles, PayField, SelectPrompt, TextAction, TipSummary } from './tip-ui';

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
  const [showCustom, setShowCustom] = useState(false);
  // Focus the custom field without scrolling the page: autoFocus jumped the
  // view back to the top on a phone (UI/UX audit, UX-05).
  useEffect(() => {
    if (showCustom) document.getElementById('custom-amount')?.focus({ preventScroll: true });
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
      <AmountTiles
        amounts={thresholds}
        isActive={amt => !custom && selectedAmount === amt * 100}
        onPick={amt => { setSelectedAmount(amt * 100); setCustom(''); setShowCustom(false); }}
        format={amt => fmt.format(amt)}
        label={t('selectAmount')}
      />

      {/* Custom amount — a small link that reveals the input on click. */}
      {!showCustom ? (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 4 }}>
          <TextAction onClick={() => setShowCustom(true)}>{t('customAmount')}</TextAction>
        </div>
      ) : (
        <div className="dg-reveal" style={{ marginTop: 12 }}>
          <PayField
            id="custom-amount"
            type="text" inputMode="decimal" autoComplete="off" placeholder={t('otherAmount')} value={custom}
            // The field had no label at all, only a placeholder — which
            // disappears the moment anything is typed, leaving a screen
            // reader with an unnamed number box on the payment screen.
            ariaLabel={t('customAmount')}
            prefix={currencySymbol || undefined}
            // At most two decimals: 12,345 € was accepted, then shown as 12,35 €.
            onChange={e => { if (/^\d*([.,]\d{0,2})?$/.test(e.target.value)) { setCustom(e.target.value); } }}
            error={customInvalid
              ? (tooHigh
                ? t('maxAmount', { max: fmtCents.format(TIP_MAX_CENTS / 100) })
                : t('minAmount', { min: fmtCents.format(TIP_MIN_CENTS / 100) }))
              : null}
          />
        </div>
      )}

      {/* What will be charged: tip, service fee, total (UX-04). */}
      {hasAmount && tipAmount && (
        <TipSummary
          marginTop={showCustom ? 16 : 8}
          labels={{ tip: t('summaryTip'), fee: t('summaryFee'), total: t('summaryTotal') }}
          tip={fmtCents.format(tipAmount / 100)}
          fee={fmtCents.format(serviceFee / 100)}
          total={fmtCents.format(totalAmount / 100)}
          perPerson={null}
          info={t('feeInfo')}
          infoLabel={t('feeInfoLabel')}
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
            fallback={<div style={{ marginTop: 16 }}><PayError>{t('errors.initFailed')}</PayError></div>}
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

      {!hasAmount && <SelectPrompt>{t('selectAmountPrompt')}</SelectPrompt>}
    </>
  );
}
