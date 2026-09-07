'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

const card: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius)',
  padding: 20,
  marginBottom: 20,
};

/** Cents and a currency, straight from the Stripe price the checkout bills. */
export type DisplayPrice = { unitAmount: number; currency: string };

type Props = {
  groupId: string;
  isPro: boolean;
  locale: 'fr' | 'en';
  /** Null for either interval when no price is configured in this environment. */
  pricing: { monthly: DisplayPrice | null; yearly: DisplayPrice | null; yearlyMonthsFree: number | null };
  /** True right after Stripe checkout, before the webhook has flipped the plan. */
  justPaid?: boolean;
};

export function ProCard({ groupId, isPro, locale, pricing, justPaid = false }: Props) {
  const t = useTranslations('dashboard.pro');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const money = (p: DisplayPrice) =>
    new Intl.NumberFormat(locale === 'fr' ? 'fr-FR' : 'en-US', {
      style: 'currency',
      currency: p.currency.toUpperCase(),
      // 19,00 € reads like an invoice. A price on a card should read like a
      // price, so whole amounts lose the decimals and 19,50 € keeps them.
      minimumFractionDigits: p.unitAmount % 100 === 0 ? 0 : 2,
    }).format(p.unitAmount / 100);

  async function go(interval: 'monthly' | 'yearly') {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/billing/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId, interval, locale }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        setError(data.error === 'pro_unavailable' ? t('unavailable') : t('failed'));
        setBusy(false);
        return;
      }
      window.location.href = data.url;
    } catch {
      setError(t('failed'));
      setBusy(false);
    }
  }

  // Paid, but the webhook has not landed yet. Deliberately not the active card:
  // that one offers "manage my subscription", and the portal cannot be opened
  // for a subscription the group has not recorded yet, so the button would have
  // started a second checkout for someone who has just paid once.
  if (justPaid && !isPro) {
    return (
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span style={{
            padding: '2px 8px', borderRadius: 100, fontSize: 11, fontWeight: 700,
            background: 'var(--success-bg)', color: 'var(--success)',
          }}>
            ✓
          </span>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{t('checkoutDoneTitle')}</div>
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.6, margin: 0 }}>
          {t('checkoutDoneBody')}
        </p>
      </div>
    );
  }

  if (isPro) {
    return (
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span style={{
            padding: '2px 8px', borderRadius: 100, fontSize: 11, fontWeight: 700,
            background: 'var(--success-bg)', color: 'var(--success)',
          }}>
            Pro
          </span>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{t('activeTitle')}</div>
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.6, marginBottom: 14 }}>
          {t('activeBody')}
        </p>
        <button
          className="btn-ghost"
          type="button"
          onClick={() => go('monthly')}
          disabled={busy}
          style={{
            padding: '9px 16px', borderRadius: 10,
            border: '1px solid var(--border)', background: 'var(--surface-2)',
            color: 'var(--text-2)', fontSize: 13, fontWeight: 600,
            cursor: busy ? 'default' : 'pointer', fontFamily: 'var(--font)',
            opacity: busy ? 0.6 : 1,
          }}
        >
          {busy ? t('opening') : t('manage')}
        </button>
        {error && (
          <p style={{ fontSize: 12.5, color: 'var(--error)', marginTop: 10 }}>{error}</p>
        )}
      </div>
    );
  }

  return (
    <div style={{ ...card, border: '1px solid var(--accent-border, rgba(229,122,151,0.3))' }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
        {t('upsellTitle')}
      </div>

      <ul style={{
        listStyle: 'none', padding: 0, margin: '0 0 16px',
        display: 'flex', flexDirection: 'column', gap: 7,
      }}>
        {[t('feature1'), t('feature2'), t('feature3')].map((f) => (
          <li key={f} style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>
            <span style={{ color: 'var(--accent)', marginRight: 7 }}>✓</span>
            {f}
          </li>
        ))}
      </ul>

      {/* The amount, read from the Stripe price the checkout actually bills.
          It used to be spelled out inside the button label in each language,
          which meant the dashboard could advertise one price and debit
          another. The yearly amount was not written down anywhere at all: the
          button promised "2 mois offerts" off a number nobody could see. */}
      {pricing.monthly && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em' }}>
            {t('priceMonthly', { price: money(pricing.monthly) })}
          </div>
          {pricing.yearly && (
            <div style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: 3 }}>
              {t('priceYearly', { price: money(pricing.yearly) })}
              {pricing.yearlyMonthsFree != null && (
                <> · {t('monthsFree', { months: pricing.yearlyMonthsFree })}</>
              )}
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button
          className="btn-accent"
          type="button"
          onClick={() => go('monthly')}
          disabled={busy}
          // Flat accent, not the gradient with a coloured drop shadow it used
          // to carry. That treatment appears nowhere else in the dashboard,
          // which made the loudest object on the billing page the one nobody
          // came for.
          style={{
            padding: '10px 18px', borderRadius: 10, border: 'none',
            background: 'var(--accent)', color: 'var(--accent-fg)',
            fontSize: 13, fontWeight: 700,
            cursor: busy ? 'default' : 'pointer', fontFamily: 'var(--font)',
            opacity: busy ? 0.6 : 1,
          }}
        >
          {busy ? t('opening') : t('ctaMonthly')}
        </button>
        {pricing.yearly && (
        <button
          className="btn-ghost"
          type="button"
          onClick={() => go('yearly')}
          disabled={busy}
          style={{
            padding: '10px 18px', borderRadius: 10,
            border: '1px solid var(--border)', background: 'var(--surface-2)',
            color: 'var(--text-2)', fontSize: 13, fontWeight: 600,
            cursor: busy ? 'default' : 'pointer', fontFamily: 'var(--font)',
            opacity: busy ? 0.6 : 1,
          }}
        >
          {t('ctaYearly')}
        </button>
        )}
      </div>

      {error && <p style={{ fontSize: 12.5, color: 'var(--error)', marginTop: 10 }}>{error}</p>}
    </div>
  );
}
