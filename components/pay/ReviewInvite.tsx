'use client';

import { useTranslations } from 'next-intl';
import { trackEvent } from '@/lib/analytics';

/**
 * The post-tip Google review invitation.
 *
 * It was a plain anchor until now, which is why Digitip Pro could list the
 * feature and never say what it produced: nobody, subscriber or platform, had
 * a single number about it. This reports the click twice, on purpose and to
 * two different audiences. `trackEvent` goes to our own funnel analytics.
 * `/api/reviews/click` writes one row against the tip, which is what lets a
 * subscriber be told "12 of your 47 tips this month sent someone to your
 * review page" instead of being sold a feature list.
 *
 * Neither report is allowed to delay the customer: `sendBeacon` hands the
 * request to the browser, which delivers it after this page is gone, and the
 * link keeps working with the whole thing blocked or failing.
 */
export function ReviewInvite({
  reviewUrl,
  staffName,
  transactionId,
}: {
  reviewUrl: string;
  staffName: string | null;
  /** Null in demo mode, where no tip exists to attribute a click to. */
  transactionId: string | null;
}) {
  const t = useTranslations('pay');

  function report() {
    trackEvent('review_cta_clicked', { named: Boolean(staffName) });
    if (!transactionId) return;
    try {
      const body = JSON.stringify({ transactionId });
      // A normal fetch racing a navigation to another origin is routinely
      // cancelled mid-flight; sendBeacon exists precisely for this.
      navigator.sendBeacon?.(
        '/api/reviews/click',
        new Blob([body], { type: 'application/json' }),
      );
    } catch {
      // A click that goes uncounted is a worse statistic, not a worse tip.
    }
  }

  return (
    <a
      href={reviewUrl}
      target="_blank"
      rel="noopener noreferrer"
      onClick={report}
      style={{
        display: 'block', textDecoration: 'none',
        background: 'var(--surface)', border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-lg)', padding: 20, marginBottom: 20,
        boxShadow: 'var(--shadow)',
      }}
    >
      <div style={{ fontSize: 22, letterSpacing: 2, color: '#f5a623', marginBottom: 8 }}>
        ★★★★★
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
        {staffName ? t('reviewTitleNamed', { name: staffName }) : t('reviewTitle')}
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6, marginBottom: 14 }}>
        {t('reviewBody')}
      </div>
      <span style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        width: '100%', boxSizing: 'border-box',
        padding: '12px 20px', borderRadius: 'var(--radius)',
        background: 'var(--accent)', color: 'var(--accent-fg, #fff)',
        fontSize: 14, fontWeight: 700,
      }}>
        {t('reviewButton')}
      </span>
    </a>
  );
}
