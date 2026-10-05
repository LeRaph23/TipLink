'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { TrialState } from '@/lib/billing/trial';
import { CustomerPreview } from '@/components/billing/CustomerPreview';
import { startProTrial } from '@/actions/billing/pro-trial';
import { Link, useRouter } from '@/i18n/navigation';
import { longDate } from '@/lib/format/long-date';

/** The figures the card argues with. Serializable: built on the server. */
export type CardImpact = {
  tipCount: number;
  clickCount: number;
  complimentCount: number;
  hasReviewLink: boolean;
};

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
  /** Where the group stands in its trial, if it ever started one. */
  trial: TrialState;
  /** When a cancelled subscription ends (ISO), or null when it renews. */
  cancelAt?: string | null;
  /** What Pro produced: this month for a subscriber, the trial for a trialist. */
  impact?: CardImpact | null;
  /** Tips this month, for the free offer's opening line. */
  monthTipCount?: number | null;
  /** Never had a trial of either kind: the offer starts the cardless one. */
  trialAvailable?: boolean;
};

export function ProCard({
  groupId, isPro, locale, pricing, justPaid = false, trial, cancelAt = null, impact = null, monthTipCount = null,
  trialAvailable = false,
}: Props) {
  const t = useTranslations('dashboard.pro');
  const router = useRouter();
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

  // No card, no checkout: the trial starts here and the page re-renders on
  // the trial card. Stripe only appears when there is something to pay.
  async function startTrial() {
    setBusy(true);
    setError(null);
    try {
      const r = await startProTrial(groupId);
      if (!r.ok) setError(t('failed'));
      router.refresh();
    } catch {
      setError(t('failed'));
    }
    setBusy(false);
  }

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

  const fmtDate = (d: Date | string) => longDate(d, locale);

  const primaryBtn: React.CSSProperties = {
    padding: '11px 18px', borderRadius: 10, border: 'none',
    background: 'var(--accent)', color: 'var(--accent-fg)',
    fontSize: 13.5, fontWeight: 700,
    cursor: busy ? 'default' : 'pointer', fontFamily: 'var(--font)',
    opacity: busy ? 0.6 : 1,
  };
  const ghostBtn: React.CSSProperties = {
    padding: '11px 18px', borderRadius: 10,
    border: '1px solid var(--border)', background: 'var(--surface-2)',
    color: 'var(--text-2)', fontSize: 13.5, fontWeight: 600,
    cursor: busy ? 'default' : 'pointer', fontFamily: 'var(--font)',
    opacity: busy ? 0.6 : 1,
  };

  const errorLine = error && (
    <p style={{ fontSize: 12.5, color: 'var(--error)', marginTop: 10 }}>{error}</p>
  );

  // The three figures Pro is judged on, wherever there are any to show.
  // The figures, set like the stats on the home page: in a row, divided by a
  // hairline, no boxes. Only the ones that mean something for this group.
  const stats = impact && impact.tipCount > 0
    ? [
        ...(impact.hasReviewLink
          ? [{ v: `${impact.clickCount}/${impact.tipCount}`, l: t('impactClicks') }]
          : []),
        { v: String(impact.complimentCount), l: t('impactCompliments') },
      ]
    : null;
  const impactRow = stats && (
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 1,
      background: 'var(--border-subtle)', border: '1px solid var(--border-subtle)',
      borderRadius: 10, overflow: 'hidden', margin: '0 0 18px',
    }}>
      {stats.map((x) => (
        <div key={x.l} style={{ background: 'var(--surface)', padding: '12px 14px' }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.04em', fontVariantNumeric: 'tabular-nums' }}>{x.v}</div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2, lineHeight: 1.4 }}>{x.l}</div>
        </div>
      ))}
    </div>
  );

  const price = pricing.monthly ? t('priceMonthly', { price: money(pricing.monthly) }) : null;

  const title: React.CSSProperties = { fontSize: 15, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.01em', margin: 0 };
  const body: React.CSSProperties = { fontSize: 13.5, color: 'var(--text-2)', lineHeight: 1.6, margin: 0, maxWidth: '62ch' };
  const note: React.CSSProperties = { fontSize: 12.5, color: 'var(--text-3)', lineHeight: 1.55, margin: '10px 0 0' };


  // Shown under every button that commits to something (starting the trial,
  // subscribing): the terms have to be one click away before, not after.
  const termsLine = (
    <p style={{ ...note, marginTop: 6 }}>
      {t.rich('terms', {
        terms: (c) => <Link href="/terms" target="_blank" style={{ color: 'var(--text-2)', textDecoration: 'underline', textUnderlineOffset: 2 }}>{c}</Link>,
        cgv: (c) => <Link href="/cgv" target="_blank" style={{ color: 'var(--text-2)', textDecoration: 'underline', textUnderlineOffset: 2 }}>{c}</Link>,
      })}
    </p>
  );

  // ── The cardless trial ────────────────────────────────────────────────────
  // Pro is on, no card is on file, nothing will be charged. Then the way to
  // keep it, without losing the days left: checkout bills from the end date.
  if (isPro && trial.state === 'trialing' && trial.cardless && !cancelAt) {
    return (
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
          <h3 style={title}>{t('freeTrialTitle')}</h3>
          <span style={{ fontSize: 12.5, color: 'var(--text-3)', fontVariantNumeric: 'tabular-nums' }}>
            {t('trialDaysLeft', { days: trial.daysLeft })}
          </span>
        </div>
        <p style={{ ...body, marginBottom: 16 }}>{t('freeTrialBody', { date: fmtDate(trial.endsAt) })}</p>
        {impactRow}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" className="btn-accent" onClick={() => go('monthly')} disabled={busy} style={primaryBtn}>
            {busy ? t('opening') : t('ctaKeep')}
          </button>
          {price && <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{price}</span>}
        </div>
        <p style={note}>{t('keepNote', { date: fmtDate(trial.endsAt) })}</p>
        {termsLine}
        {errorLine}
      </div>
    );
  }

  if (isPro) {
    // A subscription cancelled from the portal stays trialing/active until its
    // end date: say that, rather than announce the charge it will not make.
    const endsOn = cancelAt ? fmtDate(cancelAt) : null;
    const trialing = !endsOn && trial.state === 'trialing' ? trial : null;
    return (
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
          <h3 style={title}>
            {endsOn ? t('canceledTitle') : trialing ? t('trialTitle') : t('activeTitle')}
          </h3>
          {/* The number of days left, where somebody would look for it. A
              trial whose end nobody sees coming produces a surprise charge. */}
          {trialing && (
            <span style={{ fontSize: 12.5, color: 'var(--text-3)', fontVariantNumeric: 'tabular-nums' }}>
              {t('trialDaysLeft', { days: trialing.daysLeft })}
            </span>
          )}
        </div>
        <p style={{ ...body, marginBottom: 16 }}>
          {endsOn
            ? t('canceledBody', { date: endsOn })
            : trialing
            ? (pricing.monthly
                ? t('trialBody', { price: money(pricing.monthly) })
                : t('trialBodyNoPrice'))
            : t('activeBody')}
        </p>
        {impactRow}
        <button className="btn-ghost" type="button" onClick={() => go('monthly')} disabled={busy} style={ghostBtn}>
          {busy ? t('opening') : t('manage')}
        </button>
        {errorLine}
      </div>
    );
  }

  // ── The offer ─────────────────────────────────────────────────────────────
  // An ordinary dashboard card: a title with the price opposite, one sentence,
  // three rows set like the settings page, the button. What the customer sees
  // is shown as the two real cards, not described.
  const rows = (['benefitReviews', 'benefitCompliments'] as const);

  return (
    <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 340px', minWidth: 0, padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
            <h3 style={title}>{t('offerTitle')}</h3>
            {price && (
              <span style={{ fontSize: 13, color: 'var(--text-2)', fontWeight: 600 }}>{price}</span>
            )}
          </div>
          <p style={body}>
            {monthTipCount && monthTipCount > 0
              ? t('offerLeadCount', { count: monthTipCount })
              : t('offerLead')}
          </p>
          {trial.state === 'ended' && (
            <p style={{ ...note, marginTop: 6 }}>{t('trialEnded', { date: fmtDate(trial.endedAt) })}</p>
          )}

          <dl style={{ margin: '16px 0 18px', borderTop: '1px solid var(--border-subtle)' }}>
            {rows.map((k) => (
              <div key={k} style={{
                display: 'grid', gridTemplateColumns: 'minmax(96px, 120px) minmax(0, 1fr)', gap: 12,
                padding: '10px 0', borderBottom: '1px solid var(--border-subtle)',
              }}>
                <dt style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{t(`${k}Title`)}</dt>
                <dd style={{ margin: 0, fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>{t(`${k}Body`)}</dd>
              </div>
            ))}
          </dl>

          {trial.state === 'ended' && stats && (
            <>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)', marginBottom: 2 }}>{t('duringTrial')}</div>
              {impactRow}
            </>
          )}

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              className="btn-accent"
              type="button"
              onClick={() => (trialAvailable ? startTrial() : go('monthly'))}
              disabled={busy}
              style={primaryBtn}
            >
              {busy ? t('opening') : trialAvailable ? t('ctaFreeTrial') : t('ctaMonthly')}
            </button>
            {pricing.yearly && !trialAvailable && (
              <button className="btn-ghost" type="button" onClick={() => go('yearly')} disabled={busy} style={ghostBtn}>
                {t('ctaYearly')}
              </button>
            )}
          </div>
          <p style={note}>
            {trialAvailable ? t('reassuranceTrial') : t('reassurance')}
          </p>
          {termsLine}
          {errorLine}
        </div>

        <div style={{
          flex: '1 1 260px', minWidth: 0, padding: 20,
          background: 'var(--surface-2)', borderLeft: '1px solid var(--border-subtle)',
        }}>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 10 }}>{t('previewLabel')}</div>
          <CustomerPreview
            labels={{
              reviewTitle: t('previewReview', { name: 'Julie' }),
              reviewBody: t('previewReviewBody'),
              reviewButton: t('previewReviewButton'),
              complimentTitle: t('previewCompliment', { name: 'Julie' }),
              chips: [t('previewChip1'), t('previewChip2'), t('previewChip3')],
            }}
          />
        </div>
      </div>

      <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border-subtle)', fontSize: 12.5, color: 'var(--text-3)', lineHeight: 1.5 }}>
        {t('alwaysFree')}
      </div>
    </div>
  );
}
