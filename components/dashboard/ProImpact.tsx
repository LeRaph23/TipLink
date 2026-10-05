import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import type { ProImpact as Impact } from '@/lib/billing/pro-impact';
import { cardTitleStyle } from './ui';

/**
 * What Digitip Pro produced, on the dashboard home, for a group that has it
 * (subscribed or on the cardless trial).
 *
 * Three figures: the Google listing as Google reports it now (read live, never
 * stored, credited to Google Maps as the Places policies require), customers
 * who opened it after tipping, and the notes the team received. Set like the rest of the home page, numbers in a
 * row divided by a hairline, and a bad month reads as a bad month.
 *
 * A missing Google link turns the first two off, so it takes their place as a
 * sentence with the fix, rather than two zeros.
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

  const stat: React.CSSProperties = { minWidth: 0, padding: '14px 16px', background: 'var(--surface)' };
  const big: React.CSSProperties = {
    fontSize: 24, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.04em',
    fontVariantNumeric: 'tabular-nums', lineHeight: 1.1,
  };
  const small: React.CSSProperties = { fontSize: 12.5, color: 'var(--text-3)', lineHeight: 1.45, marginTop: 4 };

  const cells: React.ReactNode[] = [];
  if (impact.hasReviewLink) {
    cells.push(
      <div key="reviews" style={stat}>
        {impact.listing ? (
          <>
            <div style={big}>
              {impact.listing.rating !== null ? `${impact.listing.rating.toLocaleString(locale)} ★` : '—'}
            </div>
            <div style={small}>
              {t('reviewsTotal', { count: impact.listing.reviewCount })}
              <br />
              <span style={{ fontSize: 11 }}>{t('source')}</span>
            </div>
          </>
        ) : (
          <div style={{ ...small, marginTop: 0 }}>{t('reviewsUnavailable')}</div>
        )}
      </div>,
      <div key="clicks" style={stat}>
        <div style={big}>{t('clicksRatio', { clicks: impact.clickCount, tips: impact.tipCount })}</div>
        <div style={small}>{impact.tipCount > 0 ? t('clicksBody') : t('clicksEmpty')}</div>
      </div>,
    );
  }
  cells.push(
    <div key="notes" style={stat}>
      <div style={big}>{impact.complimentCount}</div>
      <div style={small}>
        {t('compliments')}
        {impact.complimentCount > 0 && (
          <>
            {' · '}
            <Link href="/dashboard/compliments" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>
              {t('complimentsLink')}
            </Link>
          </>
        )}
      </div>
    </div>,
  );

  return (
    <section
      aria-label={t('label')}
      style={{
        background: 'var(--surface)', border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius)', marginBottom: 20, overflow: 'hidden',
      }}
    >
      <div style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
        padding: '14px 16px', borderBottom: '1px solid var(--border-subtle)',
      }}>
        <h3 style={cardTitleStyle}>{trialDaysLeft !== null ? t('titleTrial') : t('titleMonth')}</h3>
        {trialDaysLeft !== null && (
          <Link href="/dashboard/billing#pro" style={{ fontSize: 12.5, color: 'var(--text-3)', textDecoration: 'none', fontVariantNumeric: 'tabular-nums' }}>
            {t('daysLeft', { days: trialDaysLeft })}
          </Link>
        )}
      </div>

      {!impact.hasReviewLink && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
          padding: '12px 16px', borderBottom: '1px solid var(--border-subtle)',
          fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5,
        }}>
          <span style={{ flex: '1 1 260px', minWidth: 0 }}>{t('noLinkBody')}</span>
          <Link href={fixLinkHref} style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)', textDecoration: 'none', whiteSpace: 'nowrap' }}>
            {t('noLinkCta')} →
          </Link>
        </div>
      )}

      {/* Hairlines between the figures that survive wrapping on a phone: the
          grid's background shows through a 1 px gap. */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
        gap: 1, background: 'var(--border-subtle)',
      }}>
        {cells}
      </div>
    </section>
  );
}
