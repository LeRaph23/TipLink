'use client';

import { useTranslations } from 'next-intl';
import { trackEvent } from '@/lib/analytics';
import { PayIcon, btnProps } from './ui';

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

  // The card is not the link: only the button is, so the target matches what
  // looks pressable and a stray tap on the text opens nothing.
  const b = btnProps('primary', 'L', { full: true });
  return (
    <div style={{
      marginTop: 16, padding: 20, borderRadius: 'var(--radius-lg)',
      background: 'var(--surface)', border: '1px solid var(--border-subtle)',
    }}>
      <div aria-hidden="true" style={{ display: 'flex', gap: 2, marginBottom: 12 }}>
        {[0, 1, 2, 3, 4].map(i => <PayIcon key={i} name="star" size={20} color="#F2A93B" />)}
      </div>
      <h2 style={{ font: '600 20px/28px var(--font-display)', letterSpacing: 0, color: 'var(--text)' }}>
        {staffName ? t('reviewTitleNamed', { name: staffName.trim().split(/\s+/)[0] || staffName }) : t('reviewTitle')}
      </h2>
      <p style={{ font: '400 14px/20px var(--font)', color: 'var(--text-2)', margin: '4px 0 16px' }}>
        {t('reviewBody')}
      </p>
      <a
        href={reviewUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={report}
        className={b.className}
        style={b.style}
      >
        {t('reviewButton')}
        <PayIcon name="external" size={18} />
      </a>
    </div>
  );
}
