import { getTranslations } from 'next-intl/server';
import type { ReviewImpact as Impact } from '@/lib/billing/review-teaser';
import { cardTitleStyle } from './ui';

/**
 * What the Pro subscription produced this month, in the only terms that can be
 * checked: tips taken, and how many of them sent their customer to the review
 * page.
 *
 * Deliberately not the accent surface. That register belongs to things the
 * manager has to act on; this is a result, and a result that dresses itself as
 * an alert is asking for attention it does not need. It is also the answer to
 * "what does the subscription actually do for me", which nothing in the
 * product could answer before.
 *
 * It reports a bad month honestly. A card that only appeared when the number
 * flattered the feature would be worth nothing the month it mattered.
 */
export async function ReviewImpact({ impact }: { impact: Impact }) {
  const t = await getTranslations('dashboard.reviewImpact');

  return (
    <section
      aria-label={t('label')}
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius)',
        padding: '16px 18px',
        marginBottom: 20,
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        flexWrap: 'wrap',
      }}
    >
      <div style={{
        fontSize: 26, fontWeight: 700, color: 'var(--text)',
        letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums', flexShrink: 0,
      }}>
        {t('ratio', { clicks: impact.clickCount, tips: impact.tipCount })}
      </div>
      <div style={{ flex: '1 1 220px', minWidth: 0 }}>
        <h3 style={{ ...cardTitleStyle, marginBottom: 2 }}>
          {impact.clickCount > 0 ? t('title') : t('emptyTitle')}
        </h3>
        <div style={{ fontSize: 12.5, color: 'var(--text-3)', lineHeight: 1.5 }}>
          {impact.clickCount > 0 ? t('body') : t('emptyBody')}
        </div>
      </div>
    </section>
  );
}
