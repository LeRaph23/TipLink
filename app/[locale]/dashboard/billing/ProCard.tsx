'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { TRIAL_DAYS, type TrialState } from '@/lib/billing/trial';
import { PhonePreview } from '@/components/billing/PhonePreview';
import { startProTrial } from '@/actions/billing/pro-trial';
import { useRouter } from '@/i18n/navigation';

/** The figures the card argues with. Serializable: built on the server. */
export type CardImpact = {
  tipCount: number;
  clickCount: number;
  complimentCount: number;
  reviewsGained: number | null;
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

  const fmtDate = (d: Date | string) =>
    new Intl.DateTimeFormat(locale === 'fr' ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'long', year: 'numeric' })
      .format(new Date(d));

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
  const impactRow = impact && impact.tipCount > 0 && (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '0 0 16px' }}>
      {[
        ...(impact.hasReviewLink && impact.reviewsGained !== null
          ? [{ v: `+${impact.reviewsGained}`, l: t('impactReviews') }]
          : []),
        ...(impact.hasReviewLink
          ? [{ v: `${impact.clickCount}/${impact.tipCount}`, l: t('impactClicks') }]
          : []),
        { v: String(impact.complimentCount), l: t('impactCompliments') },
      ].map((x) => (
        <div key={x.l} style={{
          flex: '1 1 120px', padding: '10px 12px', borderRadius: 10,
          background: 'var(--surface-2)', border: '1px solid var(--border-subtle)',
        }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>{x.v}</div>
          <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2, lineHeight: 1.4 }}>{x.l}</div>
        </div>
      ))}
    </div>
  );

  const priceBlock = pricing.monthly && (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em' }}>
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
  );

  // ── The cardless trial ────────────────────────────────────────────────────
  // Pro is on, no card is on file, nothing will be charged. The card says all
  // three, then offers to keep Pro, without costing the days left: checkout
  // starts billing on the date the trial was already going to end.
  if (isPro && trial.state === 'trialing' && trial.cardless && !cancelAt) {
    return (
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
          <span style={{
            padding: '2px 8px', borderRadius: 100, fontSize: 11, fontWeight: 700,
            background: 'var(--accent-muted)', color: 'var(--accent)',
          }}>
            Pro
          </span>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{t('freeTrialTitle')}</div>
          <span style={{
            padding: '2px 8px', borderRadius: 100, fontSize: 11.5, fontWeight: 700,
            background: 'var(--surface-2)', border: '1px solid var(--border)',
            color: 'var(--text-2)', fontVariantNumeric: 'tabular-nums',
          }}>
            {t('trialDaysLeft', { days: trial.daysLeft })}
          </span>
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.6, margin: '0 0 14px' }}>
          {t('freeTrialBody', { date: fmtDate(trial.endsAt) })}
        </p>
        {impactRow}
        {priceBlock}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" className="btn-accent" onClick={() => go('monthly')} disabled={busy} style={primaryBtn}>
            {busy ? t('opening') : t('ctaKeep')}
          </button>
          {pricing.yearly && (
            <button type="button" className="btn-ghost" onClick={() => go('yearly')} disabled={busy} style={ghostBtn}>
              {t('ctaYearly')}
            </button>
          )}
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '10px 0 0', lineHeight: 1.5 }}>
          {t('keepNote', { date: fmtDate(trial.endsAt) })}
        </p>
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
          <span style={{
            padding: '2px 8px', borderRadius: 100, fontSize: 11, fontWeight: 700,
            background: 'var(--success-bg)', color: 'var(--success)',
          }}>
            Pro
          </span>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
            {endsOn ? t('canceledTitle') : trialing ? t('trialTitle') : t('activeTitle')}
          </div>
          {/* The number of days left, in the one place somebody would look for
              it. A trial whose end nobody sees coming produces a surprise
              charge, which costs more trust than the subscription is worth. */}
          {trialing && (
            <span style={{
              padding: '2px 8px', borderRadius: 100, fontSize: 11.5, fontWeight: 700,
              background: 'var(--surface-2)', border: '1px solid var(--border)',
              color: 'var(--text-2)', fontVariantNumeric: 'tabular-nums',
            }}>
              {t('trialDaysLeft', { days: trialing.daysLeft })}
            </span>
          )}
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.6, marginBottom: 14 }}>
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
  // It used to be a title, three feature bullets and a price. Now it leads
  // with the manager's own number when there is one, shows the customer's
  // screen instead of describing it, and says in a table what stays free, so
  // "subscription" never reads as "the tips now cost money".
  const free = [t('rowTips'), t('rowTeam'), t('rowStats'), t('rowExport')];
  const pro = [t('rowReviews'), t('rowCompliments'), t('rowListing')];

  return (
    <div style={{ ...card, padding: 0, overflow: 'hidden', border: '1px solid var(--accent-border, rgba(229,122,151,0.3))' }}>
      <div style={{
        display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center',
        padding: 22,
        background: 'linear-gradient(135deg, rgba(229,122,151,0.08), rgba(236,151,176,0.03))',
      }}>
        <div style={{ flex: '1 1 300px', minWidth: 0 }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
            Digitip Pro
          </div>
          <h3 style={{ fontSize: 21, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em', lineHeight: 1.25, margin: '0 0 8px' }}>
            {t('offerTitle')}
          </h3>
          <p style={{ fontSize: 13.5, color: 'var(--text-2)', lineHeight: 1.6, margin: 0 }}>
            {monthTipCount && monthTipCount > 0
              ? t('offerLeadCount', { count: monthTipCount })
              : t('offerLead')}
          </p>

          {/* A spent trial is said out loud, with what it produced, and the
              button below stops offering one. A product that offers a free
              trial to somebody who has already had it is either lying or
              about to. */}
          {trial.state === 'ended' && (
            <p style={{ fontSize: 12.5, color: 'var(--text-3)', lineHeight: 1.5, margin: '12px 0 0' }}>
              {t('trialEnded', { date: fmtDate(trial.endedAt) })}
            </p>
          )}

          <ul style={{ listStyle: 'none', padding: 0, margin: '16px 0 0', display: 'grid', gap: 12 }}>
            {(['benefitReviews', 'benefitCompliments', 'benefitListing'] as const).map((k, i) => (
              <li key={k} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <span aria-hidden="true" style={{
                  width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'var(--surface)', border: '1px solid var(--border-subtle)', fontSize: 14,
                }}>
                  {['⭐', '💬', '📈'][i]}
                </span>
                <span>
                  <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, color: 'var(--text)' }}>{t(`${k}Title`)}</span>
                  <span style={{ display: 'block', fontSize: 12.5, color: 'var(--text-3)', lineHeight: 1.5 }}>{t(`${k}Body`)}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div style={{ flex: '0 0 auto', margin: '0 auto' }}>
          <PhonePreview
            labels={{
              thanks: t('previewThanks'),
              reviewTitle: t('previewReview', { name: 'Julie' }),
              reviewButton: t('previewReviewButton'),
              complimentTitle: t('previewCompliment', { name: 'Julie' }),
              chips: [t('previewChip1'), t('previewChip2'), t('previewChip3')],
            }}
          />
        </div>
      </div>

      {trial.state === 'ended' && impactRow && (
        <div style={{ padding: '16px 22px 0' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 8 }}>{t('duringTrial')}</div>
          {impactRow}
        </div>
      )}

      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', padding: 22, borderTop: '1px solid var(--border-subtle)' }}>
        <div style={{ flex: '1 1 240px', minWidth: 0 }}>
          {/* A grid, not a <table>: the dashboard turns every table into a
              horizontally scrolling block on phones, which hid the Pro column
              of a comparison that only has to fit three short columns. */}
          <div role="table" aria-label={t('compareLabel')} style={{ fontSize: 12.5 }}>
            <div role="row" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 64px 44px', paddingBottom: 8 }}>
              <span role="columnheader" />
              <span role="columnheader" style={{ textAlign: 'center', color: 'var(--text-3)', fontWeight: 600 }}>{t('colFree')}</span>
              <span role="columnheader" style={{ textAlign: 'center', color: 'var(--accent)', fontWeight: 700 }}>Pro</span>
            </div>
            {[...free.map((r) => [r, true] as const), ...pro.map((r) => [r, false] as const)].map(([label, inFree]) => (
              <div role="row" key={label} style={{
                display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 64px 44px', alignItems: 'center',
                borderTop: '1px solid var(--border-subtle)', padding: '7px 0',
              }}>
                <span role="cell" style={{ color: 'var(--text-2)', lineHeight: 1.4 }}>{label}</span>
                <span role="cell" aria-label={inFree ? t('included') : t('notIncluded')} style={{ textAlign: 'center', color: inFree ? 'var(--success)' : 'var(--text-3)' }}>
                  {inFree ? '✓' : '—'}
                </span>
                <span role="cell" aria-label={t('included')} style={{ textAlign: 'center', color: 'var(--accent)', fontWeight: 700 }}>✓</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ flex: '1 1 220px', minWidth: 0 }}>
          {priceBlock}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              className="btn-accent"
              type="button"
              onClick={() => (trialAvailable ? startTrial() : go('monthly'))}
              disabled={busy}
              style={primaryBtn}
            >
              {busy
                ? t('opening')
                : trialAvailable
                  ? t('ctaFreeTrial', { days: TRIAL_DAYS })
                  : t('ctaMonthly')}
            </button>
            {pricing.yearly && !trialAvailable && (
              <button className="btn-ghost" type="button" onClick={() => go('yearly')} disabled={busy} style={ghostBtn}>
                {t('ctaYearly')}
              </button>
            )}
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '10px 0 0', lineHeight: 1.5 }}>
            {trialAvailable ? t('reassuranceTrial') : t('reassurance')}
          </p>
          {errorLine}
        </div>
      </div>
    </div>
  );
}
