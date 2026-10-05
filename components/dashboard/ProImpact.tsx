import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import type { ProImpact as Impact } from '@/lib/billing/pro-impact';
import { cardTitleStyle } from './ui';

/**
 * What Digitip Pro produced, on the dashboard home, for a group that has it
 * (subscribed or on the cardless trial).
 *
 * It replaces a single ratio of clicks. Three numbers now, in decreasing order
 * of how much they matter to a manager: reviews actually gained on the Google
 * listing, customers sent to the review page, and compliments the team
 * received. Each is a fact about their own business, and a bad month reads as
 * a bad month: the card does not hide when the figures are low.
 *
 * A missing Google link is the one problem that turns all of it off, so it
 * replaces the review tiles with the fix rather than showing two zeros.
 */
export async function ProImpact({
  impact,
  locale,
  trialDaysLeft,
  fixLinkHref,
}: {
  impact: Impact;
  locale: string;
  /** Set during a trial, cardless or not: the window is then the trial. */
  trialDaysLeft: number | null;
  fixLinkHref: string;
}) {
  const t = await getTranslations('dashboard.proImpact');
  const fmtDate = (iso: string) =>
    new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long' }).format(new Date(iso));

  const tile: React.CSSProperties = {
    flex: '1 1 160px', minWidth: 0, padding: '12px 14px',
    background: 'var(--surface-2)', border: '1px solid var(--border-subtle)',
    borderRadius: 10,
  };
  const big: React.CSSProperties = {
    fontSize: 24, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.03em',
    fontVariantNumeric: 'tabular-nums', lineHeight: 1.15,
  };
  const small: React.CSSProperties = { fontSize: 12, color: 'var(--text-3)', lineHeight: 1.45, marginTop: 3 };

  return (
    <section
      aria-label={t('label')}
      style={{
        background: 'var(--surface)', border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius)', padding: '16px 18px', marginBottom: 20,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <span style={{
          padding: '2px 8px', borderRadius: 100, fontSize: 11, fontWeight: 700,
          background: 'var(--accent-muted)', color: 'var(--accent)',
        }}>
          Pro
        </span>
        <h3 style={{ ...cardTitleStyle, margin: 0 }}>
          {trialDaysLeft !== null ? t('titleTrial') : t('titleMonth')}
        </h3>
        {trialDaysLeft !== null && (
          <Link href="/dashboard/billing" style={{
            marginLeft: 'auto', padding: '2px 9px', borderRadius: 100, fontSize: 11.5, fontWeight: 600,
            background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-2)',
            textDecoration: 'none', fontVariantNumeric: 'tabular-nums',
          }}>
            {t('daysLeft', { days: trialDaysLeft })}
          </Link>
        )}
      </div>

      {!impact.hasReviewLink && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
          padding: '12px 14px', marginBottom: 10, borderRadius: 10,
          background: 'var(--warning-bg)', border: '1px solid var(--border-subtle)',
        }}>
          <div style={{ flex: '1 1 220px', minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{t('noLinkTitle')}</div>
            <div style={small}>{t('noLinkBody')}</div>
          </div>
          <Link href={fixLinkHref} className="btn-accent" style={{
            display: 'inline-flex', alignItems: 'center', minHeight: 36, padding: '0 14px',
            borderRadius: 9, background: 'var(--accent)', color: 'var(--accent-fg)',
            fontSize: 13, fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap',
          }}>
            {t('noLinkCta')}
          </Link>
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {impact.hasReviewLink && (
          <div style={tile}>
            {impact.listing ? (
              <>
                <div style={big}>+{impact.listing.gained}</div>
                <div style={small}>
                  {t('reviewsGained', { since: fmtDate(impact.listing.since) })}
                  {' · '}
                  {t('reviewsTotal', { count: impact.listing.currentCount })}
                  {impact.listing.rating !== null && ` · ${impact.listing.rating.toLocaleString(locale)} ★`}
                </div>
              </>
            ) : (
              <>
                <div style={{ ...big, color: 'var(--text-3)' }}>…</div>
                <div style={small}>{t('reviewsPending')}</div>
              </>
            )}
          </div>
        )}
        {impact.hasReviewLink && (
          <div style={tile}>
            <div style={big}>{t('clicksRatio', { clicks: impact.clickCount, tips: impact.tipCount })}</div>
            <div style={small}>{impact.tipCount > 0 ? t('clicksBody') : t('clicksEmpty')}</div>
          </div>
        )}
        <Link href="/dashboard/compliments" style={{ ...tile, textDecoration: 'none', display: 'block' }} className="dash-row">
          <div style={big}>{impact.complimentCount}</div>
          <div style={small}>{t('compliments')} →</div>
        </Link>
      </div>
    </section>
  );
}
